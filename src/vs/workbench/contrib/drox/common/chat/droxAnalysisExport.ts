/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxTranscriptMessage } from '../droxSession.js';

/** Au-delà, le texte quitte la ligne et va dans blobs/<hash>.txt. */
const INLINE_MAX_CHARS = 400;
const ANCHOR_LIST_MAX = 8;

interface ICaptureMessage {
	readonly role?: string;
	readonly id?: string;
	readonly kind?: string;
	readonly chars?: number;
	readonly text?: string;
	readonly name?: string;
	readonly error?: boolean;
	readonly tools?: readonly string[];
}

interface IToolCallGroup {
	readonly name?: string;
	readonly count?: number;
	readonly identical?: boolean;
	readonly truncated?: number;
}

interface ICaptureRecord {
	readonly kind?: string;
	readonly turn?: number;
	readonly loop?: string;
	readonly beforeChars?: number;
	readonly transportChars?: number;
	readonly duplicateUsersDropped?: number;
	readonly danglingToolCalls?: boolean;
	readonly messages?: readonly ICaptureMessage[];
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly phase?: string;
	readonly textualTool?: boolean;
	readonly toolCalls?: readonly IToolCallGroup[];
}

export interface IDroxAnalysisBlob {
	readonly hash: string;
	readonly text: string;
}

export interface IDroxAnalysisExport {
	readonly index: string;
	readonly transcript: string;
	readonly blobs: readonly IDroxAnalysisBlob[];
}

function parseRecords(raw: string | undefined): ICaptureRecord[] {
	if (!raw?.trim()) {
		return [];
	}
	const out: ICaptureRecord[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const row = JSON.parse(trimmed) as ICaptureRecord;
			if (row && typeof row === 'object') {
				out.push(row);
			}
		} catch {
			// ligne illisible
		}
	}
	return out;
}

function blobHash(text: string): string {
	let h = 0xcbf29ce484222325n;
	for (let i = 0; i < text.length; i++) {
		h ^= BigInt(text.charCodeAt(i));
		h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
	}
	return h.toString(16).padStart(16, '0');
}

function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

function capList(ids: readonly string[]): string {
	if (ids.length <= ANCHOR_LIST_MAX) {
		return ids.join(',');
	}
	const shown = ids.slice(0, ANCHOR_LIST_MAX).join(',');
	return `${shown},+${ids.length - ANCHOR_LIST_MAX}`;
}

/**
 * Index court + transcript (une ligne JSON par événement) + blobs pour les textes longs.
 * Les ancres `tour-N` et `outil-<nom>-N` se cherchent dans le transcript.
 */
export function buildDroxAnalysisExport(opts: {
	readonly sessionId: string;
	readonly runCaptureRaw?: string;
	readonly messages?: readonly IDroxTranscriptMessage[];
}): IDroxAnalysisExport {
	const records = parseRecords(opts.runCaptureRaw);
	const requests = records.filter(row => row.kind === 'llm_request');
	const results = records.filter(row => row.kind === 'llm_result');
	if (requests.length === 0 && results.length === 0) {
		return buildFromPersistedMessages(opts.sessionId, opts.messages ?? []);
	}

	const blobs = new Map<string, string>();
	const spill = (text: string): { text?: string; blob?: string; chars: number } => {
		const chars = text.length;
		if (chars <= INLINE_MAX_CHARS) {
			return { text, chars };
		}
		const hash = blobHash(text);
		blobs.set(hash, text);
		return { blob: hash, chars };
	};

	const transcript: string[] = [];
	const toolStats = new Map<string, { calls: number; errors: number; identicalTurns: number; truncated: number; first?: string; anchors: string[] }>();
	const blocks = new Map<string, { id: string; kind: string; injections: number; first: string; blob?: string; chars: number }>();
	const toolSeq = new Map<string, number>();
	const duplicateTours: string[] = [];
	let duplicateDropped = 0;
	const danglingTours: string[] = [];
	const textualTours: string[] = [];
	const stoppedAnchors: string[] = [];
	const loops = new Map<string, number>();
	let tokensIn = 0;
	let tokensOut = 0;

	const resultByTurn = new Map<number, ICaptureRecord>();
	for (const result of results) {
		if (typeof result.turn === 'number') {
			resultByTurn.set(result.turn, result);
		}
	}

	const indexTurns: string[] = [];

	for (const request of requests) {
		const turn = request.turn ?? 0;
		const tour = `tour-${turn}`;
		const loop = request.loop || 'none';
		loops.set(loop, (loops.get(loop) ?? 0) + 1);
		if ((request.duplicateUsersDropped ?? 0) > 0) {
			duplicateDropped += request.duplicateUsersDropped ?? 0;
			duplicateTours.push(tour);
		}
		if (request.danglingToolCalls) {
			danglingTours.push(tour);
		}
		transcript.push(line({
			id: tour,
			kind: 'request',
			loop,
			beforeChars: request.beforeChars ?? 0,
			transportChars: request.transportChars ?? 0,
			duplicateUsersDropped: request.duplicateUsersDropped ?? 0,
			dangling: Boolean(request.danglingToolCalls),
		}));

		for (const message of request.messages ?? []) {
			if (message.role === 'system') {
				const rawId = message.id || 'unmatched';
				const text = message.text ?? '';
				const key = rawId === 'unmatched' ? `unmatched:${blobHash(text)}` : rawId;
				const shown = rawId === 'unmatched' ? `unmatched:${blobHash(text).slice(0, 8)}` : rawId;
				const existing = blocks.get(key);
				if (existing) {
					existing.injections += 1;
				} else {
					const placed = spill(text);
					const blockId = `block-${shown}`;
					blocks.set(key, {
						id: shown,
						kind: message.kind || 'system',
						injections: 1,
						first: tour,
						blob: placed.blob,
						chars: placed.chars,
					});
					transcript.push(line({
						id: blockId,
						kind: 'catalog',
						ref: shown,
						blockKind: message.kind || 'system',
						chars: placed.chars,
						text: placed.text,
						blob: placed.blob,
					}));
				}
				transcript.push(line({
					id: tour,
					kind: 'system',
					ref: shown,
					chars: message.chars ?? text.length,
				}));
			} else if (message.role === 'user' || message.role === 'assistant') {
				const placed = spill(message.text ?? '');
				transcript.push(line({
					id: tour,
					kind: message.role,
					chars: placed.chars,
					tools: message.tools,
					text: placed.text,
					blob: placed.blob,
				}));
			} else if (message.role === 'tool') {
				const name = message.name || '?';
				const n = (toolSeq.get(name) ?? 0) + 1;
				toolSeq.set(name, n);
				const anchor = `outil-${name}-${n}`;
				const text = message.text ?? '';
				const placed = spill(text);
				const stopped = /the user stopped this command/i.test(text);
				if (stopped) {
					stoppedAnchors.push(anchor);
				}
				const stats = toolStats.get(name) ?? { calls: 0, errors: 0, identicalTurns: 0, truncated: 0, anchors: [] };
				if (!stats.first) {
					stats.first = anchor;
				}
				if (message.error) {
					stats.errors += 1;
					stats.anchors.push(anchor);
				}
				toolStats.set(name, stats);
				transcript.push(line({
					id: anchor,
					kind: 'tool',
					turn: tour,
					name,
					error: Boolean(message.error),
					stopped,
					chars: placed.chars,
					text: placed.text,
					blob: placed.blob,
				}));
			}
		}

		const result = resultByTurn.get(turn);
		const callSummary: string[] = [];
		const identical: string[] = [];
		if (result) {
			tokensIn += result.inputTokens ?? 0;
			tokensOut += result.outputTokens ?? 0;
			if (result.textualTool) {
				textualTours.push(tour);
			}
			for (const group of result.toolCalls ?? []) {
				const name = group.name || '?';
				const count = group.count ?? 0;
				const stats = toolStats.get(name) ?? { calls: 0, errors: 0, identicalTurns: 0, truncated: 0, anchors: [] };
				stats.calls += count;
				stats.truncated += group.truncated ?? 0;
				if (count > 1 && group.identical) {
					stats.identicalTurns += 1;
					identical.push(name);
				}
				toolStats.set(name, stats);
				callSummary.push(`${name}:${count}`);
			}
			transcript.push(line({
				id: tour,
				kind: 'result',
				phase: result.phase || '',
				in: result.inputTokens ?? 0,
				out: result.outputTokens ?? 0,
				textualTool: Boolean(result.textualTool),
				calls: result.toolCalls ?? [],
			}));
		}
		indexTurns.push(
			`${tour} loop=${loop} phase=${result?.phase || '-'} tools=${callSummary.join(',') || '-'} duplicate_users=${request.duplicateUsersDropped ?? 0} dangling=${request.danglingToolCalls ? 'true' : 'false'} textual=${result?.textualTool ? 'true' : 'false'}${identical.length ? ` identical=${identical.join(',')}` : ''}`,
		);
	}

	const index: string[] = [
		'# Index. Chercher tour-N et outil-nom-N dans latest-transcript.txt. Les blob= sont dans blobs/.',
		`session ${opts.sessionId}`,
		`capture requests=${requests.length} results=${results.length}`,
		`tokens in=${tokensIn} out=${tokensOut}`,
		'',
	];
	for (const [name, row] of toolStats) {
		const anchors = row.anchors.length ? ` error_anchors=${capList(row.anchors)}` : '';
		const first = row.first ? ` first=${row.first}` : '';
		index.push(`tool ${name} calls=${row.calls} errors=${row.errors} identical_turns=${row.identicalTurns} truncated=${row.truncated}${first}${anchors}`);
	}
	index.push('');
	for (const block of blocks.values()) {
		const blob = block.blob ? ` blob=${block.blob}` : '';
		index.push(`block ${block.id} kind=${block.kind} injections=${block.injections} first=${block.first} chars=${block.chars}${blob}`);
	}
	index.push('');
	index.push(`anomaly duplicate_users_dropped=${duplicateDropped} tours=${capList(duplicateTours) || '-'}`);
	index.push(`anomaly dangling_requests=${danglingTours.length} tours=${capList(danglingTours) || '-'}`);
	index.push(`anomaly textual_tool_turns=${textualTours.length} tours=${capList(textualTours) || '-'}`);
	index.push(`anomaly stopped=${stoppedAnchors.length} anchors=${capList(stoppedAnchors) || '-'}`);
	index.push('');
	for (const [label, count] of loops) {
		index.push(`loop ${label} requests=${count}`);
	}
	index.push('');
	index.push(...indexTurns);

	return {
		index: index.join('\n') + '\n',
		transcript: transcript.join('\n') + (transcript.length ? '\n' : ''),
		blobs: [...blobs.entries()].map(([hash, text]) => ({ hash, text })),
	};
}

function buildFromPersistedMessages(sessionId: string, messages: readonly IDroxTranscriptMessage[]): IDroxAnalysisExport {
	const blobs = new Map<string, string>();
	const transcript: string[] = [];
	let n = 0;
	for (const message of messages) {
		n += 1;
		const id = `tour-${n}`;
		const text = messageText(message);
		const chars = text.length;
		let inline: string | undefined = text;
		let blob: string | undefined;
		if (chars > INLINE_MAX_CHARS) {
			blob = blobHash(text);
			blobs.set(blob, text);
			inline = undefined;
		}
		transcript.push(line({
			id,
			kind: message.role,
			chars,
			text: inline,
			blob,
		}));
	}
	const index = [
		'# Index. Pas de capture moteur pour cette session. Le transcript reprend les messages persistés, une ligne chacun.',
		`session ${sessionId}`,
		'capture none',
		`messages ${messages.length}`,
		'',
	].join('\n') + '\n';
	return {
		index,
		transcript: transcript.join('\n') + (transcript.length ? '\n' : ''),
		blobs: [...blobs.entries()].map(([hash, text]) => ({ hash, text })),
	};
}

function messageText(message: IDroxTranscriptMessage): string {
	const parts: string[] = [];
	for (const block of message.content ?? []) {
		if (typeof block.text === 'string') {
			parts.push(block.text);
		} else if (typeof block.content === 'string') {
			parts.push(block.content);
		} else if (block.type === 'tool_use' && typeof block.name === 'string') {
			parts.push(`[tool] ${block.name}`);
		}
	}
	return parts.join('\n');
}
