/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { previewJson } from './droxToolPreview.js';
import { IDroxSessionUiStats } from '../droxSession.js';
import { IDroxTranscriptMessage } from '../droxSession.js';
import {
	formatDroxTranscriptExport,
	formatDroxPhaseAwareText,
	pushDroxExportStepSeparator,
} from './droxTranscriptExport.js';

const DEFAULT_MAX_STREAM_CHARS = 200_000;
const DEFAULT_MAX_TOOL_PREVIEW_CHARS = 80_000;
const DEFAULT_MAX_GATE_RESPONSE_CHARS = 120_000;

export interface IFormatDroxUiReplayExportOptions {
	readonly sessionId: string;
	readonly workspacePath?: string;
	readonly journal: readonly Record<string, unknown>[];
	readonly transcriptMessageCount?: number;
	readonly transcriptMessages?: readonly IDroxTranscriptMessage[];
	readonly uiStats?: IDroxSessionUiStats;
	readonly exportedAt?: Date;
	readonly maxStreamChars?: number;
	readonly maxToolPreviewChars?: number;
	readonly maxGateResponseChars?: number;
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function pushSection(out: string[], heading: string, body: string): void {
	out.push(heading);
	out.push('');
	if (body.trim()) {
		out.push(body.trim());
	} else {
		out.push('(empty)');
	}
	out.push('');
}

function extractJsonObjects(text: string): string[] {
	const found: string[] = [];
	let depth = 0;
	let start = -1;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '{') {
			if (depth === 0) {
				start = i;
			}
			depth += 1;
		} else if (ch === '}' && depth > 0) {
			depth -= 1;
			if (depth === 0 && start >= 0) {
				found.push(text.slice(start, i + 1));
				start = -1;
			}
		}
	}
	return found;
}

function formatTodoUpdate(entry: Record<string, unknown>, out: string[]): void {
	const todos = entry.todos;
	if (!Array.isArray(todos) || todos.length === 0) {
		return;
	}
	out.push('### Plan (todo_write)');
	out.push('');
	for (const t of todos) {
		if (!t || typeof t !== 'object') {
			continue;
		}
		const o = t as Record<string, unknown>;
		const id = str(o.id);
		const content = str(o.content);
		const status = str(o.status) || 'pending';
		out.push(`- ${id}: ${content} (${status})`);
	}
	out.push('');
}

function formatToolJournalEntry(entry: Record<string, unknown>, out: string[]): void {
	const phase = str(entry.phase);
	const id = str(entry.id);
	const name = str(entry.name);
	const verb = str(entry.verb);
	const target = str(entry.target);
	const executor = str(entry.executorJobId);
	const execSuffix = executor ? ` · job ${executor}` : '';

	if (phase === 'start') {
		out.push(`### Tool call: ${name || '?'}${id ? ` (${id})` : ''}${execSuffix}`);
		out.push('');
		if (verb || target) {
			out.push(`→ ${verb}${target ? ` — ${target}` : ''}`);
			out.push('');
		}
		const preview = str(entry.argsPreview);
		if (preview) {
			out.push(preview);
			out.push('');
		}
		return;
	}

	if (phase === 'finish') {
		const err = entry.isError === true ? ' · ERROR' : '';
		out.push(`### Tool result${err}${name ? ` · ${name}` : ''}${id ? ` (${id})` : ''}${execSuffix}`);
		out.push('');
		const preview = str(entry.outputPreview);
		if (preview) {
			out.push(preview);
			out.push('');
			return;
		}
		if (entry.toolOutput !== undefined) {
			out.push(previewJson(entry.toolOutput, DEFAULT_MAX_TOOL_PREVIEW_CHARS));
			out.push('');
		}
	}
}

function formatGateDev(
	entry: Record<string, unknown>,
	out: string[],
	maxGateResponse: number,
): void {
	const phase = str(entry.phase);
	const gateId = str(entry.gateId);
	if (phase === 'probe') {
		pushSection(out, `### Gate probe · ${gateId || '?'}`, str(entry.questionPreview));
		return;
	}
	if (phase === 'response') {
		const lines = [
			gateId ? `Gate: ${gateId}` : '',
			entry.branch ? `Branch: ${str(entry.branch)}` : '',
			entry.value !== undefined ? `Value: ${String(entry.value)}` : '',
			str(entry.gatePath) ? `Path: ${str(entry.gatePath)}` : '',
		].filter(Boolean);
		pushSection(out, '### Gate pass (parsed)', lines.join('\n'));
		const raw = str(entry.modelResponse);
		if (raw) {
			const body =
				raw.length <= maxGateResponse
					? raw
					: `${raw.slice(0, maxGateResponse)}\n\n… [gate response truncated — ${raw.length - maxGateResponse} chars omitted]`;
			const jsonBlocks = extractJsonObjects(body);
			if (jsonBlocks.length > 0) {
				out.push('#### JSON extrait(s)');
				out.push('');
				for (const j of jsonBlocks) {
					out.push('```json');
					out.push(j);
					out.push('```');
					out.push('');
				}
			}
			pushSection(out, '#### Réponse brute du modèle (tour gate)', body);
		}
		return;
	}
	if (phase === 'complete') {
		const lines = [
			str(entry.gatePath) ? `Path: ${str(entry.gatePath)}` : '',
			str(entry.startRun) ? `Start run: ${str(entry.startRun)}` : '',
		].filter(Boolean);
		pushSection(out, '### Gate chain complete → START_RUN', lines.join('\n'));
	}
}

function formatFileChange(entry: Record<string, unknown>, out: string[]): void {
	const op = str(entry.operation) || str(entry.op) || 'change';
	const path = str(entry.path) || str(entry.filePath);
	pushSection(out, `### File ${op}`, path);
}

/**
 * Export chronologique du journal UI (`.ui-replay.jsonl`) — ordre d'apparition à l'écran.
 */
export function formatDroxUiReplayExport(opts: IFormatDroxUiReplayExportOptions): string {
	const exportedAt = opts.exportedAt ?? new Date();
	const maxStream = opts.maxStreamChars ?? DEFAULT_MAX_STREAM_CHARS;
	const maxGateResponse = opts.maxGateResponseChars ?? DEFAULT_MAX_GATE_RESPONSE_CHARS;
	const out: string[] = [];
	let step = 0;
	let deltaBuf = '';
	let currentRole = '';
	let currentPhase = '';
	let streamKind: 'thinking' | 'content' | 'answer' = 'content';

	const streamStepTitle = (): string => {
		const parts: string[] = [];
		if (streamKind === 'thinking') {
			parts.push('THINKING STREAM');
		} else if (streamKind === 'answer') {
			parts.push('ANSWER STREAM');
		} else {
			parts.push('ASSISTANT STREAM');
		}
		if (currentRole) {
			parts.push(currentRole);
		}
		if (currentPhase) {
			parts.push(currentPhase);
		}
		return parts.join(' · ');
	};

	const flushDelta = (): void => {
		const chunk = deltaBuf.trim();
		deltaBuf = '';
		if (!chunk) {
			return;
		}
		step += 1;
		pushDroxExportStepSeparator(out, step, streamStepTitle());
		const body =
			chunk.length <= maxStream
				? chunk
				: `${chunk.slice(0, maxStream)}\n\n… [stream truncated — ${chunk.length - maxStream} chars omitted]`;
		formatDroxPhaseAwareText(body, out);
	};

	const emit = (title: string, fn: () => void): void => {
		flushDelta();
		step += 1;
		pushDroxExportStepSeparator(out, step, title);
		fn();
	};

	out.push('Drox export — journal UI (ordre chronologique)');
	out.push(`Session: ${opts.sessionId}`);
	if (opts.workspacePath) {
		out.push(`Workspace: ${opts.workspacePath}`);
	}
	out.push(`Exported: ${exportedAt.toISOString()}`);
	out.push(`UI journal events: ${opts.journal.length}`);
	if (opts.transcriptMessageCount !== undefined) {
		out.push(
			`Transcript session (moteur, messages persistés): ${opts.transcriptMessageCount}`,
		);
	}
	if (opts.uiStats) {
		out.push(
			`Tokens (in/out/ctx): ${opts.uiStats.totalIn} / ${opts.uiStats.totalOut} / ${opts.uiStats.ctx}`,
		);
	}
	out.push('');
	out.push(
		'Chaque step = un événement UI dans l\'ordre d\'affichage. Les THINKING STREAM = flux Ollama `internal_reasoning` ; ASSISTANT STREAM = canal content ; GATE = tours gate (réponse modèle complète).',
	);

	for (const entry of opts.journal) {
		const kind = str(entry.kind);
		if (!kind) {
			continue;
		}

		switch (kind) {
			case 'delta': {
				const text = str(entry.text);
				if (text) {
					deltaBuf += text;
				}
				break;
			}
			case 'clearAssistant':
				emit('ASSISTANT STREAM RESET', () => {
					out.push('(nouveau segment — buffer stream vidé)');
					out.push('');
				});
				currentPhase = '';
				streamKind = 'content';
				break;
			case 'phase':
				flushDelta();
				if (entry.close === true) {
					currentPhase = '';
					streamKind = 'content';
					emit('PHASE CLOSE', () => {
						out.push('### Fin phase thinking native (→ canal content)');
						out.push('');
					});
				} else {
					const phase = str(entry.phase);
					if (phase) {
						currentPhase = phase;
						streamKind =
							phase === 'internal_reasoning' || phase === 'reasoning'
								? 'thinking'
								: phase === 'answering'
									? 'answer'
									: 'content';
						const exec = str(entry.executorJobId);
						emit(`PHASE · ${phase}${exec ? ` (${exec})` : ''}`, () => {
							out.push(`### Phase: ${phase}`);
							out.push('');
						});
					}
				}
				break;
			case 'append': {
				const role = str(entry.role) || 'assistant';
				const text = str(entry.text);
				emit(role.toUpperCase(), () => {
					if (role === 'user') {
						pushSection(out, '## User', text);
					} else {
						formatDroxPhaseAwareText(text, out);
					}
				});
				break;
			}
			case 'userFacingReply':
				flushDelta();
				streamKind = 'answer';
				emit('USER-FACING REPLY (canonique moteur)', () => {
					pushSection(out, '## Réponse affichée utilisateur', str(entry.text));
				});
				break;
			case 'orchestrationRole':
				flushDelta();
				currentRole = str(entry.role);
				if (currentRole === 'architect_discussion') {
					streamKind = 'content';
				} else if (currentRole === 'architect_intent') {
					streamKind = 'content';
				}
				emit(`ROLE · ${currentRole || '?'}`, () => {
					const exec = str(entry.executorJobId);
					pushSection(
						out,
						'### Orchestration role',
						`${currentRole}${exec ? `\nExecutor job: ${exec}` : ''}`,
					);
				});
				break;
			case 'gateDev':
				flushDelta();
				emit(`GATE · ${str(entry.phase) || '?'}`, () =>
					formatGateDev(entry, out, maxGateResponse),
				);
				break;
			case 'gatePath':
				flushDelta();
				emit('GATE PATH', () => {
					const lines = [
						str(entry.gatePath) ? `Path: ${str(entry.gatePath)}` : '',
						str(entry.startRun) ? `Start run: ${str(entry.startRun)}` : '',
						str(entry.gateId) ? `Gate: ${str(entry.gateId)}` : '',
						entry.branch ? `Branch: ${str(entry.branch)}` : '',
						entry.value !== undefined ? `Value: ${String(entry.value)}` : '',
					].filter(Boolean);
					pushSection(out, '### Gate path', lines.join('\n'));
				});
				break;
			case 'tool':
				emit('TOOL', () => formatToolJournalEntry(entry, out));
				break;
			case 'todoUpdate':
				emit('TODO', () => formatTodoUpdate(entry, out));
				break;
			case 'exploreNotice':
				emit('NOTICE', () => pushSection(out, '### Notice', str(entry.text)));
				break;
			case 'runObjective':
				emit('RUN OBJECTIVE', () => pushSection(out, '### Run objective', str(entry.text)));
				break;
			case 'loopIntervention':
				emit('LOOP INTERVENTION', () => {
					pushSection(
						out,
						`### Loop · ${str(entry.level) || 'warn'}`,
						str(entry.userMessage),
					);
				});
				break;
			case 'railStationEnter':
				flushDelta();
				emit('RAIL STATION ENTER', () => {
					const lines = [
						str(entry.station) ? `Station: ${str(entry.station)}` : '',
						str(entry.label) ? `Label: ${str(entry.label)}` : '',
						str(entry.taskId) ? `Task: ${str(entry.taskId)}` : '',
					].filter(Boolean);
					pushSection(
						out,
						`### Rail · enter · ${str(entry.station) || '?'}`,
						lines.join('\n'),
					);
				});
				break;
			case 'railStationHold':
				flushDelta();
				emit('RAIL STATION HOLD', () => {
					pushSection(
						out,
						`### Rail · hold · ${str(entry.station) || '?'}`,
						'En attente du retour utilisateur',
					);
				});
				break;
			case 'railStationDone':
				flushDelta();
				emit('RAIL STATION DONE', () => {
					pushSection(
						out,
						`### Rail · done · ${str(entry.station) || '?'}`,
						'Station terminée',
					);
				});
				break;
			case 'railSegmentStart':
				flushDelta();
				emit('RAIL SEGMENT START', () => {
					const scope = Array.isArray(entry.scope) ? entry.scope.map(String) : [];
					const lines = [
						str(entry.station) ? `Station: ${str(entry.station)}` : '',
						str(entry.taskId) ? `Task: ${str(entry.taskId)}` : '',
						str(entry.label) ? `Label: ${str(entry.label)}` : '',
						scope.length > 0 ? `Scope: ${scope.join(', ')}` : '',
					].filter(Boolean);
					pushSection(
						out,
						`### Rail · segment start · ${str(entry.taskId) || '?'}`,
						lines.join('\n'),
					);
				});
				break;
			case 'railSegmentDone':
				flushDelta();
				emit('RAIL SEGMENT DONE', () => {
					const paths = Array.isArray(entry.pathsTouched)
						? entry.pathsTouched.map(String)
						: [];
					const lines = [
						str(entry.status) ? `Status: ${str(entry.status)}` : '',
						str(entry.summary) ? str(entry.summary) : '',
						paths.length > 0 ? `Paths: ${paths.join(', ')}` : '',
					].filter(Boolean);
					pushSection(
						out,
						`### Rail · segment done · ${str(entry.taskId) || '?'}`,
						lines.join('\n'),
					);
				});
				break;
			case 'subagentStart':
				emit('SUBAGENT START', () => {
					pushSection(
						out,
						`### Subagent · ${str(entry.subagentType)}`,
						str(entry.description),
					);
				});
				break;
			case 'subagentDone':
				emit('SUBAGENT DONE', () => {
					const lines = [
						str(entry.summary),
						entry.truncated === true ? '(truncated)' : '',
						entry.iterationsUsed !== undefined
							? `Iterations: ${String(entry.iterationsUsed)}`
							: '',
						entry.errorMessage ? `Error: ${str(entry.errorMessage)}` : '',
					].filter(Boolean);
					pushSection(out, `### Subagent done · ${str(entry.subagentType)}`, lines.join('\n'));
				});
				break;
			case 'fileChange':
				emit('FILE CHANGE', () => formatFileChange(entry, out));
				break;
			case 'userPromptSticky':
				emit('USER PROMPT STICKY', () => pushSection(out, '### Sticky prompt', str(entry.text)));
				break;
			case 'memory':
				emit('MEMORY', () => {
					pushSection(
						out,
						'### Memory checkpoint',
						`${str(entry.slug)}\n${str(entry.path)}\n${str(entry.objective)}`,
					);
				});
				break;
			default:
				break;
		}
	}

	flushDelta();

	out.push('');
	out.push(`— fin journal UI (${step} steps) —`);
	return out.join('\n');
}

/**
 * Export complet : journal UI chronologique + transcript moteur (tools, blocs assistant détaillés).
 */
export function formatDroxCombinedSessionExport(
	opts: IFormatDroxUiReplayExportOptions,
): string {
	const uiPart = formatDroxUiReplayExport(opts);
	const messages = opts.transcriptMessages ?? [];
	if (messages.length === 0) {
		return uiPart;
	}
	const enginePart = formatDroxTranscriptExport({
		sessionId: opts.sessionId,
		workspacePath: opts.workspacePath,
		messages,
		uiStats: opts.uiStats,
		exportedAt: opts.exportedAt,
	});
	const sep = '\n\n' + '═'.repeat(72) + '\n\n';
	return (
		uiPart +
		sep +
		'PARTIE B — Transcript moteur (session persistée, tours complets avec tools)\n\n' +
		enginePart
	);
}
