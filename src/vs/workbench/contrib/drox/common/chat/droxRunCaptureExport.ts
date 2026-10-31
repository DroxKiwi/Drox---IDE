/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

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

function xml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function parseRecords(raw: string): ICaptureRecord[] {
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
			// ligne illisible : on la signale plus bas via le compteur
		}
	}
	return out;
}

/** Partie F : payload réellement envoyé, plus les comptes écrits par le moteur. */
export function formatDroxRunCaptureExport(sessionId: string, raw: string | undefined): string {
	const records = raw ? parseRecords(raw) : [];
	const requests = records.filter(row => row.kind === 'llm_request');
	const results = records.filter(row => row.kind === 'llm_result');
	if (requests.length === 0 && results.length === 0) {
		return [
			'<run_capture armed="false">',
			'Pas de capture pour cette session. Le bouton bug était éteint : le moteur n\'a rien enregistré.',
			'</run_capture>',
		].join('\n');
	}

	const toolCalls = new Map<string, { calls: number; identicalTurns: number; truncated: number }>();
	const toolErrors = new Map<string, number>();
	const blocks = new Map<string, { kind: string; injections: number; chars: number; text: string }>();
	const loops = new Map<string, number>();
	let duplicateUsers = 0;
	let dangling = 0;
	let textual = 0;
	let tokensIn = 0;
	let tokensOut = 0;

	for (const request of requests) {
		duplicateUsers += request.duplicateUsersDropped ?? 0;
		if (request.danglingToolCalls) {
			dangling += 1;
		}
		const loop = request.loop || 'none';
		loops.set(loop, (loops.get(loop) ?? 0) + 1);
		for (const message of request.messages ?? []) {
			if (message.role === 'system') {
				const id = message.id || 'unmatched';
				const text = message.text ?? '';
				const key = id === 'unmatched' ? `unmatched:${text}` : id;
				const existing = blocks.get(key);
				if (existing) {
					existing.injections += 1;
				} else {
					blocks.set(key, {
						kind: message.kind || 'system',
						injections: 1,
						chars: message.chars ?? text.length,
						text,
					});
				}
			}
			if (message.role === 'tool' && message.error) {
				const name = message.name || '?';
				toolErrors.set(name, (toolErrors.get(name) ?? 0) + 1);
			}
		}
	}
	for (const result of results) {
		tokensIn += result.inputTokens ?? 0;
		tokensOut += result.outputTokens ?? 0;
		if (result.textualTool) {
			textual += 1;
		}
		for (const group of result.toolCalls ?? []) {
			const name = group.name || '?';
			const row = toolCalls.get(name) ?? { calls: 0, identicalTurns: 0, truncated: 0 };
			row.calls += group.count ?? 0;
			row.truncated += group.truncated ?? 0;
			if ((group.count ?? 0) > 1 && group.identical) {
				row.identicalTurns += 1;
			}
			toolCalls.set(name, row);
		}
	}

	const lines: string[] = [];
	lines.push(`<run_capture armed="true" session="${xml(sessionId)}" requests="${requests.length}" results="${results.length}">`);
	lines.push('<stats>');
	for (const [name, row] of toolCalls) {
		const errors = toolErrors.get(name) ?? 0;
		lines.push(`  <tool name="${xml(name)}" calls="${row.calls}" errors="${errors}" identical_turns="${row.identicalTurns}" truncated="${row.truncated}"/>`);
	}
	for (const [name, errors] of toolErrors) {
		if (!toolCalls.has(name)) {
			lines.push(`  <tool name="${xml(name)}" calls="0" errors="${errors}" identical_turns="0" truncated="0"/>`);
		}
	}
	for (const [id, block] of blocks) {
		const shown = id.startsWith('unmatched:') ? 'unmatched' : id;
		lines.push(`  <block id="${xml(shown)}" kind="${xml(block.kind)}" injections="${block.injections}"/>`);
	}
	for (const [label, count] of loops) {
		lines.push(`  <loop label="${xml(label)}" requests="${count}"/>`);
	}
	lines.push(`  <anomaly duplicate_users_dropped="${duplicateUsers}" dangling_requests="${dangling}" textual_tool_turns="${textual}"/>`);
	lines.push(`  <tokens in="${tokensIn}" out="${tokensOut}"/>`);
	lines.push('</stats>');
	lines.push('<catalog>');
	for (const [id, block] of blocks) {
		const shown = id.startsWith('unmatched:') ? 'unmatched' : id;
		lines.push(`  <block id="${xml(shown)}" kind="${xml(block.kind)}" chars="${block.chars}" injections="${block.injections}">`);
		lines.push(xml(block.text));
		lines.push('  </block>');
	}
	lines.push('</catalog>');

	const resultByTurn = new Map<number, ICaptureRecord>();
	for (const result of results) {
		if (typeof result.turn === 'number') {
			resultByTurn.set(result.turn, result);
		}
	}
	for (const request of requests) {
		const turn = request.turn ?? 0;
		lines.push(`<llm_turn n="${turn}" loop="${xml(request.loop || 'none')}" before_chars="${request.beforeChars ?? 0}" transport_chars="${request.transportChars ?? 0}" dangling="${request.danglingToolCalls ? 'true' : 'false'}">`);
		for (const message of request.messages ?? []) {
			if (message.role === 'system') {
				const id = message.id || 'unmatched';
				lines.push(`  <system id="${xml(id)}" kind="${xml(message.kind || 'system')}" chars="${message.chars ?? 0}" see_catalog="true"/>`);
			} else if (message.role === 'user') {
				lines.push(`  <user chars="${message.chars ?? 0}">`);
				lines.push(xml(message.text ?? ''));
				lines.push('  </user>');
			} else if (message.role === 'assistant') {
				const tools = (message.tools ?? []).join(',');
				lines.push(`  <assistant chars="${message.chars ?? 0}" tools="${xml(tools)}">`);
				lines.push(xml(message.text ?? ''));
				lines.push('  </assistant>');
			} else if (message.role === 'tool') {
				lines.push(`  <tool name="${xml(message.name || '?')}" error="${message.error ? 'true' : 'false'}" chars="${message.chars ?? 0}">`);
				lines.push(xml(message.text ?? ''));
				lines.push('  </tool>');
			}
		}
		const result = resultByTurn.get(turn);
		if (result) {
			lines.push(`  <model_result phase="${xml(result.phase || '')}" in="${result.inputTokens ?? 0}" out="${result.outputTokens ?? 0}" textual_tool="${result.textualTool ? 'true' : 'false'}">`);
			for (const group of result.toolCalls ?? []) {
				lines.push(`    <call name="${xml(group.name || '?')}" count="${group.count ?? 0}" identical="${group.identical ? 'true' : 'false'}" truncated="${group.truncated ?? 0}"/>`);
			}
			lines.push('  </model_result>');
		}
		lines.push('</llm_turn>');
	}
	lines.push('</run_capture>');
	return lines.join('\n');
}
