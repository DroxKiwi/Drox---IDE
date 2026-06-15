/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { pushDroxExportStepSeparator } from './droxTranscriptExport.js';

const DEFAULT_MAX_SYSTEM_BLOCK_CHARS = 200_000;

export interface IDroxEngineSystemBlock {
	readonly blockId: string;
	readonly charCount: number;
	readonly text: string;
}

export interface IDroxEngineTraceRecord {
	readonly schemaVersion?: number;
	readonly timestamp?: string;
	readonly kind: 'run_routing' | 'llm_turn_prepared';
	readonly architectGate?: string;
	readonly startRun?: string;
	readonly greetingOnly?: boolean;
	readonly expectsWorkspaceMutation?: boolean;
	readonly intentSource?: string;
	readonly iter?: number;
	readonly frameId?: string;
	readonly layersApplied?: readonly string[];
	readonly railStation?: string;
	readonly toolNames?: readonly string[];
	readonly architectSnapshotBytes?: number;
	readonly toolProtocolBytes?: number;
	readonly railSnapshotBytes?: number;
	readonly bootSystemBytes?: number;
	readonly messagesCount?: number;
	readonly systemBlocks?: readonly IDroxEngineSystemBlock[];
}

export function parseDroxEngineTraceRecord(raw: unknown): IDroxEngineTraceRecord | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const row = raw as Record<string, unknown>;
	const kind = row.kind;
	if (kind !== 'run_routing' && kind !== 'llm_turn_prepared') {
		return undefined;
	}
	const systemBlocks = Array.isArray(row.systemBlocks)
		? row.systemBlocks
			.map(b => {
				if (!b || typeof b !== 'object') {
					return undefined;
				}
				const block = b as Record<string, unknown>;
				const text = typeof block.text === 'string' ? block.text : '';
				return {
					blockId: typeof block.blockId === 'string' ? block.blockId : String(block.block_id ?? '?'),
					charCount: Number(block.charCount ?? block.char_count ?? text.length),
					text,
				} satisfies IDroxEngineSystemBlock;
			})
			.filter((b): b is IDroxEngineSystemBlock => Boolean(b))
		: undefined;
	return {
		schemaVersion: Number(row.schemaVersion ?? row.schema_version ?? 1),
		timestamp: typeof row.timestamp === 'string' ? row.timestamp : undefined,
		kind,
		architectGate: str(row.architectGate ?? row.architect_gate),
		startRun: str(row.startRun ?? row.start_run),
		greetingOnly: bool(row.greetingOnly ?? row.greeting_only),
		expectsWorkspaceMutation: bool(row.expectsWorkspaceMutation ?? row.expects_workspace_mutation),
		intentSource: str(row.intentSource ?? row.intent_source),
		iter: num(row.iter),
		frameId: str(row.frameId ?? row.frame_id),
		layersApplied: strArray(row.layersApplied ?? row.layers_applied),
		railStation: str(row.railStation ?? row.rail_station),
		toolNames: strArray(row.toolNames ?? row.tool_names),
		architectSnapshotBytes: num(row.architectSnapshotBytes ?? row.architect_snapshot_bytes),
		toolProtocolBytes: num(row.toolProtocolBytes ?? row.tool_protocol_bytes),
		railSnapshotBytes: num(row.railSnapshotBytes ?? row.rail_snapshot_bytes),
		bootSystemBytes: num(row.bootSystemBytes ?? row.boot_system_bytes),
		messagesCount: num(row.messagesCount ?? row.messages_count),
		systemBlocks,
	};
}

function str(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
	return typeof v === 'boolean' ? v : undefined;
}

function num(v: unknown): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function strArray(v: unknown): string[] | undefined {
	if (!Array.isArray(v)) {
		return undefined;
	}
	return v.filter((x): x is string => typeof x === 'string');
}

function formatSystemBlock(text: string, blockId: string, maxChars: number, out: string[]): void {
	out.push(`### System block: \`${blockId}\` (${text.length} chars)`);
	out.push('');
	if (text.length <= maxChars) {
		out.push(text);
	} else {
		out.push(text.slice(0, maxChars));
		out.push('');
		out.push(`… [block truncated — ${text.length - maxChars} chars omitted]`);
	}
	out.push('');
}

export interface IFormatDroxEngineTraceExportOptions {
	readonly sessionId: string;
	readonly records: readonly IDroxEngineTraceRecord[];
	readonly exportedAt?: Date;
	readonly maxSystemBlockChars?: number;
}

/** Export lisible du fichier `*.engine-trace.jsonl` (injection moteur). */
export function formatDroxEngineTraceExport(opts: IFormatDroxEngineTraceExportOptions): string {
	const exportedAt = opts.exportedAt ?? new Date();
	const maxBlock = opts.maxSystemBlockChars ?? DEFAULT_MAX_SYSTEM_BLOCK_CHARS;
	const out: string[] = [];
	let step = 0;

	out.push('Drox engine trace export');
	out.push(`Session: ${opts.sessionId}`);
	out.push(`Exported: ${exportedAt.toISOString()}`);
	out.push(`Engine trace records: ${opts.records.length}`);
	out.push('');
	out.push(
		'Chaque step = un événement moteur : routage orchestration ou contexte injecté avant appel LLM (blocs system complets).',
	);

	for (const rec of opts.records) {
		step += 1;
		if (rec.kind === 'run_routing') {
			pushDroxExportStepSeparator(out, step, 'RUN ROUTING (intent probe / gate)');
			out.push(`Architect gate: ${rec.architectGate ?? '?'}`);
			out.push(`Start run: ${rec.startRun ?? '?'}`);
			out.push(`Greeting only: ${rec.greetingOnly ?? '?'}`);
			out.push(`Expects workspace mutation: ${rec.expectsWorkspaceMutation ?? '?'}`);
			out.push(`Intent source: ${rec.intentSource ?? '?'}`);
			if (rec.timestamp) {
				out.push(`Timestamp: ${rec.timestamp}`);
			}
			out.push('');
			continue;
		}

		pushDroxExportStepSeparator(
			out,
			step,
			`LLM TURN PREPARED · iter ${rec.iter ?? '?'} · frame ${rec.frameId ?? '?'}`,
		);
		if (rec.timestamp) {
			out.push(`Timestamp: ${rec.timestamp}`);
		}
		if (rec.railStation) {
			out.push(`Rail station: ${rec.railStation}`);
		}
		out.push(`Messages in flight: ${rec.messagesCount ?? '?'}`);
		out.push(
			`Context bytes — boot: ${rec.bootSystemBytes ?? 0} · architect: ${rec.architectSnapshotBytes ?? 0} · protocols: ${rec.toolProtocolBytes ?? 0} · rail: ${rec.railSnapshotBytes ?? 0}`,
		);
		if (rec.layersApplied?.length) {
			out.push(`Layers applied: ${rec.layersApplied.join(', ')}`);
		}
		if (rec.toolNames?.length) {
			out.push(`Tool specs this turn: ${rec.toolNames.join(', ')}`);
		}
		out.push('');
		for (const block of rec.systemBlocks ?? []) {
			formatSystemBlock(block.text, block.blockId, maxBlock, out);
		}
	}

	out.push('');
	out.push(`— end of engine trace (${step} steps) —`);
	return out.join('\n');
}
