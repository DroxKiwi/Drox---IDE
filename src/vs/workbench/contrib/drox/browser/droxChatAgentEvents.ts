/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import {
	isHallucinatedPhaseToolName,
	isPhaseMarkerToolErrorOutput,
	isRecoveredPhaseToolOutput,
} from '../common/droxPhaseToolUi.js';
import { describeToolCall, previewJson } from '../common/droxToolPreview.js';
import { isFileMutationToolName } from '../common/droxFileMutation.js';
import { buildShellToolFinishWire, buildShellToolStartWire } from '../common/chat/droxShellToolWire.js';
import { extractTodoErrorMessage, extractTodosFromToolOutput, isTodoWriteOutput } from '../common/droxTodoExtract.js';
import { formatVisionChatError, isVisionRelatedLlmError } from '../common/droxVision.js';
import { DroxHostToWebviewMessage } from './droxChatBridge.js';

const SKIP_TOOL_UI = new Set(['course_plan_write', 'scope_defer']);

/** Outils lecture / explore — pas d'aperçu args/output verbeux dans le fil. */
const SKIP_TOOL_PREVIEW_NAMES = new Set([
	'file_read',
	'glob',
	'grep',
	'lsp',
	'web_search',
	'web_fetch',
	'workspace_map_read',
	'memory_read',
	'memory_list',
	'bash',
	'list_mcp_resources',
	'read_mcp_resource',
]);

export interface IDroxPendingTool {
	readonly name: string;
	readonly args: unknown;
}

export interface IDroxChatAgentEventHost {
	post(message: DroxHostToWebviewMessage): void;
	getCurrentSessionId(): string | undefined;
	setTabTitleFromModel(sessionId: string | undefined, text: string): void;
	trackUsageForActiveTab(inputTokens: number, outputTokens: number): void;
	trackContextForActiveTab(tokensUsed: number): void;
	getPendingTool(id: string): IDroxPendingTool | undefined;
	setPendingTool(id: string, entry: IDroxPendingTool): void;
	deletePendingTool(id: string): void;
	/** Pending fichier : id puis repli par chemin (ids Ollama parfois désynchronisés). */
	takePendingToolForFileFinish(id: string, output: unknown): IDroxPendingTool | undefined;
	clearPendingTools(): void;
	handleFileMutationAfterToolFinish(
		pendingName: string | undefined,
		output: unknown,
		isError: boolean,
		toolId: string,
		pendingArgs?: unknown,
	): void;
	getWorkspaceUri(): URI | undefined;
	ingestContextChunkSummary(wsUri: URI, summary: Record<string, unknown>): void;
}

export interface IDroxChatAgentDoneHost extends IDroxChatAgentEventHost {
	getLlmModel(): string;
	getCurrentRunId(): string | undefined;
	getSuppressedRunId(): string | undefined;
	clearSuppressedRunId(): void;
	resolveUserAskSkipped(): void;
	clearActivePermissionMode(): void;
	clearCurrentRunId(): void;
	syncChatSessionState(): void;
	finalizeRunRevert(runId: string): void;
	shouldResetConversationAfterDone(): boolean;
	clearPendingSessionReset(): void;
	resetActiveTabConversation(): void;
	notifyRunCycleFinished(runId: string | undefined, status: string | undefined, error: string | undefined): void;
}

export function extractAgentNotificationRunId(params: unknown): string | undefined {
	const p = params as { runId?: string; run_id?: string } | undefined;
	if (typeof p?.runId === 'string') {
		return p.runId;
	}
	if (typeof p?.run_id === 'string') {
		return p.run_id;
	}
	return undefined;
}

export function dispatchAgentEvent(host: IDroxChatAgentEventHost, params: unknown): void {
	const p = params as {
		event?: Record<string, unknown>;
		jobId?: string;
		job_id?: string;
	} | undefined;
	const ev = p?.event;
	if (!ev || typeof ev.kind !== 'string') {
		return;
	}

	switch (ev.kind) {
		case 'phase_close':
			host.post({ kind: 'phase', close: true });
			return;

		case 'phase_enter':
			if (typeof ev.phase === 'string') {
				host.post({ kind: 'phase', phase: ev.phase });
			}
			return;

		case 'text_delta':
			if (typeof ev.text === 'string' && ev.text.length > 0) {
				host.post({ kind: 'delta', text: ev.text });
			}
			return;

		case 'user_facing_reply':
			if (typeof ev.text === 'string' && ev.text.length > 0) {
				host.post({ kind: 'userFacingReply', text: ev.text });
			}
			return;

		case 'role_enter':
			if (typeof ev.role_id === 'string') {
				host.post({ kind: 'orchestrationRole', role: ev.role_id });
			}
			return;

		case 'tool_start': {
			const name = typeof ev.name === 'string' ? ev.name : '?';
			const id = ev.id != null ? String(ev.id) : '?';
			const args = 'arguments' in ev ? ev.arguments : undefined;
			if (id !== '?') {
				host.setPendingTool(id, { name, args });
			}
			if (name === 'delegate_executor') {
				return;
			}
			if (name === 'todo_write' || SKIP_TOOL_UI.has(name) || isHallucinatedPhaseToolName(name)) {
				return;
			}
			const isFileMutation = isFileMutationToolName(name);
			if (isFileMutation) {
				return;
			}
			const skipArgsPreview = SKIP_TOOL_PREVIEW_NAMES.has(name);
			const shellStart = buildShellToolStartWire(name, args);
			const { verb, target } = describeToolCall(name, args);
			host.post({
				kind: 'tool',
				phase: 'start',
				id,
				name,
				verb,
				target,
				argsPreview: skipArgsPreview ? '' : previewJson(args),
				...shellStart,
			});
			return;
		}

		case 'tool_finish': {
			const id = ev.id != null ? String(ev.id) : '?';
			const output = 'output' in ev ? ev.output : undefined;
			const isError = Boolean(ev.is_error ?? ev.isError);
			const pending = host.takePendingToolForFileFinish(id, output);
			const pendingName = pending?.name;

			if (pendingName === 'delegate_executor') {
				return;
			}

			if (pendingName === 'todo_write' || (!pendingName && isTodoWriteOutput(output))) {
				if (isError) {
					const msg = extractTodoErrorMessage(output) ?? 'validation rejected';
					host.post({ kind: 'exploreNotice', text: `todo_write — ${msg}` });
				} else {
					const todos = extractTodosFromToolOutput(output);
					if (todos) {
						host.post({ kind: 'todoUpdate', todos });
					}
				}
				return;
			}

			if (pendingName && SKIP_TOOL_UI.has(pendingName)) {
				return;
			}

			if (
				isRecoveredPhaseToolOutput(output)
				|| (isError && isPhaseMarkerToolErrorOutput(output))
				|| isHallucinatedPhaseToolName(pendingName)
			) {
				return;
			}

			const isFileMutationFinish =
				pendingName === 'file_edit' ||
				pendingName === 'file_write' ||
				pendingName === 'notebook_edit';
			host.handleFileMutationAfterToolFinish(pendingName, output, isError, id, pending?.args);
			if (isFileMutationFinish) {
				return;
			}
			const skipOutputPreview =
				(pendingName && SKIP_TOOL_PREVIEW_NAMES.has(pendingName));
			const outputPreview = skipOutputPreview ? '' : previewJson(output);
			const shellOutput = buildShellToolFinishWire(pendingName, output, isError);
			host.post({
				kind: 'tool',
				phase: 'finish',
				id,
				name: pendingName,
				isError,
				outputPreview,
				shellOutput,
			});
			return;
		}

		case 'run_objective':
			if (typeof ev.text === 'string' && ev.text.length > 0) {
				host.setTabTitleFromModel(host.getCurrentSessionId(), ev.text);
				host.post({ kind: 'runObjective', text: ev.text });
			}
			return;

		case 'rail_station_enter':
			if (typeof ev.station === 'string') {
				host.post({
					kind: 'railStationEnter',
					station: ev.station,
					label: typeof ev.label === 'string' ? ev.label : undefined,
					taskId: typeof ev.task_id === 'string' ? ev.task_id : undefined,
				});
			}
			return;

		case 'rail_station_hold':
			if (typeof ev.station === 'string') {
				host.post({
					kind: 'railStationHold',
					station: ev.station,
				});
			}
			return;

		case 'rail_station_done':
			if (typeof ev.station === 'string') {
				host.post({
					kind: 'railStationDone',
					station: ev.station,
				});
			}
			return;

		case 'loop_intervention': {
			const level = typeof ev.level === 'string' ? ev.level : 'warn';
			const userMessage =
				typeof ev.user_message === 'string'
					? ev.user_message
					: typeof ev.userMessage === 'string'
						? ev.userMessage
						: '';
			if (userMessage) {
				host.post({
					kind: 'loopIntervention',
					level,
					userMessage,
					kindDetail:
						typeof ev.loop_kind === 'string'
							? ev.loop_kind
							: typeof ev.loopKind === 'string'
								? ev.loopKind
								: undefined,
					turns: typeof ev.turns === 'number' ? ev.turns : undefined,
				});
			}
			return;
		}

		case 'context_usage': {
			const tokens = Number(ev.parent_tokens ?? ev.parentTokens ?? 0);
			if (tokens > 0) {
				host.trackContextForActiveTab(tokens);
				host.post({ kind: 'context', tokensUsed: tokens });
			}
			return;
		}

		case 'context_snip': {
			const freed = Number(ev.tokens_freed ?? ev.tokensFreed ?? 0);
			const snipped = Number(ev.blocks_snipped ?? ev.blocksSnipped ?? 0);
			const after = Number(ev.tokens_used_after ?? ev.tokensUsedAfter ?? 0);
			if (after > 0) {
				host.trackContextForActiveTab(after);
				host.post({ kind: 'context', tokensUsed: after });
			}
			if (freed > 0 || snipped > 0) {
				host.post({
					kind: 'append',
					role: 'system',
					text: `· context snip (~${freed} tok, ${snipped} blocks)`,
				});
			}
			return;
		}

		case 'tool_progress': {
			const id = ev.id != null ? String(ev.id) : '?';
			const output = typeof ev.output === 'string' ? ev.output : '';
			const elapsedMs = Number(ev.elapsed_ms ?? ev.elapsedMs ?? 0);
			host.post({
				kind: 'tool',
				phase: 'progress',
				id,
				name: typeof ev.name === 'string' ? ev.name : undefined,
				outputPreview: output,
				elapsedMs,
			});
			return;
		}

		case 'stop': {
			const usage = (ev.usage ?? {}) as Record<string, unknown>;
			const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
			const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
			if (inputTokens > 0 || outputTokens > 0) {
				host.trackUsageForActiveTab(inputTokens, outputTokens);
				host.post({ kind: 'usage', inputTokens, outputTokens });
			}
			// Parité TUI (`usage.rs`) : ctx = dernier `usage.input_tokens` du tour.
			if (inputTokens > 0) {
				host.trackContextForActiveTab(inputTokens);
				host.post({ kind: 'context', tokensUsed: inputTokens });
			}
			return;
		}

		case 'memory_persisted': {
			const slug = typeof ev.slug === 'string' ? ev.slug : '';
			const path = typeof ev.path === 'string' ? ev.path : '';
			const objective = typeof ev.objective === 'string' ? ev.objective : '';
			if (objective) {
				host.setTabTitleFromModel(host.getCurrentSessionId(), objective);
			}
			host.post({ kind: 'memory', slug, path, objective });
			return;
		}

		case 'run_routing': {
			host.post({
				kind: 'runRouting',
				architectGate: String(ev.architect_gate ?? ev.architectGate ?? ''),
				startRun: String(ev.start_run ?? ev.startRun ?? ''),
				greetingOnly: Boolean(ev.greeting_only ?? ev.greetingOnly),
				expectsWorkspaceMutation: Boolean(
					ev.expects_workspace_mutation ?? ev.expectsWorkspaceMutation,
				),
				intentSource: String(ev.intent_source ?? ev.intentSource ?? ''),
			});
			return;
		}

		case 'llm_turn_prepared': {
			const layersRaw = ev.layers_applied ?? ev.layersApplied;
			const toolsRaw = ev.tool_names ?? ev.toolNames;
			const layersApplied = Array.isArray(layersRaw)
				? layersRaw.filter((x: unknown): x is string => typeof x === 'string')
				: [];
			const toolNames = Array.isArray(toolsRaw)
				? toolsRaw.filter((x: unknown): x is string => typeof x === 'string')
				: [];
			host.post({
				kind: 'llmTurnPrepared',
				iter: Number(ev.iter ?? 0),
				frameId: String(ev.frame_id ?? ev.frameId ?? ''),
				layersApplied,
				railStation:
					typeof (ev.rail_station ?? ev.railStation) === 'string'
						? String(ev.rail_station ?? ev.railStation)
						: undefined,
				toolNames,
				architectSnapshotBytes: Number(ev.architect_snapshot_bytes ?? ev.architectSnapshotBytes ?? 0),
				toolProtocolBytes: Number(ev.tool_protocol_bytes ?? ev.toolProtocolBytes ?? 0),
				railSnapshotBytes: Number(ev.rail_snapshot_bytes ?? ev.railSnapshotBytes ?? 0),
				bootSystemBytes: Number(ev.boot_system_bytes ?? ev.bootSystemBytes ?? 0),
				messagesCount: Number(ev.messages_count ?? ev.messagesCount ?? 0),
			});
			return;
		}

		case 'context_compacted': {
			const before = Number(ev.tokens_before ?? ev.tokensBefore ?? 0);
			const after = Number(ev.tokens_after ?? ev.tokensAfter ?? 0);
			const removed = Number(ev.messages_removed ?? ev.messagesRemoved ?? 0);
			if (after > 0) {
				host.trackContextForActiveTab(after);
				host.post({ kind: 'context', tokensUsed: after });
			}
			const usage = (ev.usage ?? undefined) as Record<string, unknown> | undefined;
			if (usage) {
				const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
				const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
				if (inputTokens > 0 || outputTokens > 0) {
					host.trackUsageForActiveTab(inputTokens, outputTokens);
					host.post({ kind: 'usage', inputTokens, outputTokens });
				}
			}
			host.post({
				kind: 'append',
				role: 'system',
				text: `[context] compaction live ${before}→${after} tok (${removed} msgs)`,
			});
			const ccs = ev.context_chunk_summary ?? ev.contextChunkSummary;
			const wsUri = host.getWorkspaceUri();
			if (wsUri && ccs && typeof ccs === 'object' && !Array.isArray(ccs)) {
				host.ingestContextChunkSummary(wsUri, ccs as Record<string, unknown>);
			}
			return;
		}

		default:
			return;
	}
}

export function dispatchAgentDone(host: IDroxChatAgentDoneHost, params: unknown): void {
	const doneRunId = extractAgentNotificationRunId(params);
	if (doneRunId && doneRunId === host.getSuppressedRunId()) {
		host.clearSuppressedRunId();
		return;
	}

	const activeRunId = host.getCurrentRunId();
	// Notification `agent/done` d'un run précédent : ne pas skipper une carte
	// `ask_user_question` du run encore actif (réponses perdues → « pas répondu »).
	if (doneRunId && activeRunId && doneRunId !== activeRunId) {
		host.finalizeRunRevert(doneRunId);
		return;
	}

	host.resolveUserAskSkipped();
	host.clearActivePermissionMode();

	const p = params as { status?: string; error?: string } | undefined;
	host.notifyRunCycleFinished(doneRunId, p?.status, p?.error);
	if (p?.status === 'error' && p.error) {
		const raw = p.error;
		if (/loop detected/i.test(raw)) {
			host.post({
				kind: 'append',
				role: 'system',
				text: localize(
					'drox.loop.abort.hint',
					'The run stopped: the model kept looping despite automatic re-framing. Read the “Re-perspective” messages above, then rephrase or send a new instruction.',
				),
			});
		}
		const errText = /loop detected/i.test(raw)
			? localize(
				'drox.loop.abort.error',
				'Run stopped — unresolved loop (see the system message just above).',
			)
			: isVisionRelatedLlmError(raw)
				? formatVisionChatError(host.getLlmModel(), raw)
				: raw;
		host.post({ kind: 'append', role: 'error', text: errText });
	}

	if (doneRunId) {
		host.finalizeRunRevert(doneRunId);
	}

	host.clearCurrentRunId();
	host.syncChatSessionState();

	const doReset = p?.status !== 'error' && host.shouldResetConversationAfterDone();
	if (doReset) {
		host.clearPendingSessionReset();
	}

	host.clearPendingTools();
	host.post({ kind: 'state', busy: false });

	if (doReset) {
		host.resetActiveTabConversation();
	}
}
