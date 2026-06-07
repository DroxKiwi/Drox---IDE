/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { isDroxExploreToolName } from '../common/droxExploreTools.js';
import {
	isHallucinatedPhaseToolName,
	isPhaseMarkerToolErrorOutput,
	isRecoveredPhaseToolOutput,
} from '../common/droxPhaseToolUi.js';
import { describeToolCall, previewJson } from '../common/droxToolPreview.js';
import { extractTodoErrorMessage, extractTodosFromToolOutput, isTodoWriteOutput } from '../common/droxTodoExtract.js';
import { formatVisionChatError, isVisionRelatedLlmError } from '../common/droxVision.js';
import { DroxHostToWebviewMessage } from './droxChatBridge.js';

const SKIP_TOOL_UI = new Set(['course_plan_write', 'scope_defer']);

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

function executorJobIdFromEvent(ev: Record<string, unknown>): string | undefined {
	const id = ev.job_id;
	return typeof id === 'string' && id.length > 0 ? id : undefined;
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

	const notificationJobId =
		typeof p?.jobId === 'string' && p.jobId.length > 0
			? p.jobId
			: typeof p?.job_id === 'string' && p.job_id.length > 0
				? p.job_id
				: undefined;
	const executorJobId = executorJobIdFromEvent(ev) ?? notificationJobId;

	switch (ev.kind) {
		case 'phase_close':
			host.post({ kind: 'phase', close: true, executorJobId });
			return;

		case 'phase_enter':
			if (typeof ev.phase === 'string') {
				host.post({ kind: 'phase', phase: ev.phase, executorJobId });
			}
			return;

		case 'text_delta':
			if (typeof ev.text === 'string' && ev.text.length > 0) {
				host.post({ kind: 'delta', text: ev.text, executorJobId });
			}
			return;

		case 'user_facing_reply':
			if (typeof ev.text === 'string' && ev.text.length > 0) {
				host.post({ kind: 'userFacingReply', text: ev.text });
			}
			return;

		case 'role_enter':
			if (typeof ev.role_id === 'string') {
				host.post({ kind: 'orchestrationRole', role: ev.role_id, executorJobId });
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
			const { verb, target } = describeToolCall(name, args);
			const isFileMutation = name === 'file_edit' || name === 'file_write' || name === 'notebook_edit';
			const skipArgsPreview = isFileMutation || isDroxExploreToolName(name);
			const taskBackground =
				name === 'task' &&
				args &&
				typeof args === 'object' &&
				(args as Record<string, unknown>).background === true;
			host.post({
				kind: 'tool',
				phase: 'start',
				id,
				name,
				verb,
				target,
				argsPreview: skipArgsPreview ? '' : previewJson(args),
				taskBackground: taskBackground === true ? true : undefined,
				executorJobId,
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
			const skipOutputPreview =
				(isFileMutationFinish && !isError) || isDroxExploreToolName(pendingName);
			const outputPreview = skipOutputPreview ? '' : previewJson(output);
			host.handleFileMutationAfterToolFinish(pendingName, output, isError, id, pending?.args);
			host.post({
				kind: 'tool',
				phase: 'finish',
				id,
				name: pendingName,
				isError,
				outputPreview,
				toolOutput: pendingName === 'task' ? output : undefined,
				executorJobId,
			});
			return;
		}

		case 'run_objective':
			if (typeof ev.text === 'string' && ev.text.length > 0) {
				host.setTabTitleFromModel(host.getCurrentSessionId(), ev.text);
				host.post({ kind: 'runObjective', text: ev.text });
			}
			return;

		case 'subagent_start':
			if (typeof ev.subagent_type === 'string') {
				host.post({
					kind: 'subagentStart',
					subagentType: ev.subagent_type,
					description: typeof ev.description === 'string' ? ev.description : '',
					jobId: typeof ev.job_id === 'string' ? ev.job_id : undefined,
					background: ev.background === true,
				});
			}
			return;

		case 'subagent_done':
			if (typeof ev.subagent_type === 'string') {
				host.post({
					kind: 'subagentDone',
					subagentType: ev.subagent_type,
					summary: typeof ev.summary === 'string' ? ev.summary : '',
					truncated: ev.truncated === true,
					iterationsUsed: typeof ev.iterations_used === 'number' ? ev.iterations_used : undefined,
					jobId: typeof ev.job_id === 'string' ? ev.job_id : undefined,
					success: ev.success !== false,
					taskStatus:
						typeof ev.task_status === 'string' ? ev.task_status : undefined,
					errorMessage:
						typeof ev.error_message === 'string' ? ev.error_message : undefined,
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
			const after = Number(ev.tokens_used_after ?? ev.tokensUsedAfter ?? 0);
			if (after > 0) {
				host.trackContextForActiveTab(after);
				host.post({ kind: 'context', tokensUsed: after });
			}
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
				text: `[context] proactive compaction: ~${before} → ~${after} tokens, ${removed} message(s) summarized`,
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
					'Le run s\'est arrêté : le modèle tournait en rond malgré les recadrages automatiques. Relisez les messages « Re-perspective » ci-dessus, puis reformulez ou envoyez une nouvelle consigne.',
				),
			});
		}
		const errText = /loop detected/i.test(raw)
			? localize(
				'drox.loop.abort.error',
				'Run interrompu — boucle non résolue (voir le message système juste au-dessus).',
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
