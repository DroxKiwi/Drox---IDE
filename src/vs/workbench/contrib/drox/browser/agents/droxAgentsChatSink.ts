/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IFileService } from '../../../../../platform/files/common/files.js';
import { localize } from '../../../../../nls.js';
import { IChatProgress } from '../../../chat/common/chatService/chatService.js';
import {
	buildAgentsShellTerminalToolSpecificData,
	buildShellToolFinishWire,
	buildShellToolStartWire,
	formatShellToolDisplayLabel,
} from '../../common/chat/droxShellToolWire.js';
import {
	buildExploreSubagentToolSpecificData,
	buildExploreToolFinishWire,
	buildExploreToolStartWire,
} from '../../common/chat/droxExploreToolWire.js';
import { extractTodosFromToolOutput, isTodoWriteOutput } from '../../common/droxTodoExtract.js';
import { isFileMutationToolName } from '../../common/droxFileMutation.js';
import {
	fileChangeResolutionToChatProgress,
	resolveDroxFileChangeAfterToolFinish,
} from '../../common/droxFileChangeProgress.js';
import { IDroxFileChangePayload } from '../../common/droxFileChange.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { describeToolCall, previewJson } from '../../common/droxToolPreview.js';
import { IDroxAgentEventSink } from '../../common/droxAgentEventSink.js';
import { pickDroxWarmupPhrase } from '../../common/droxWarmupPhrase.js';
import { formatDroxAgentsLoopAbortMessage } from '../../common/droxLoopAbort.js';
import { isDroxThinkingRoute } from '../../common/droxPhaseRoute.js';
import { asFileChangeHostMessage } from '../../common/droxFileChange.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { extractAgentNotificationRunId } from '../droxChatAgentEvents.js';

const SKIP_TOOL_UI = new Set(['course_plan_write', 'scope_defer', 'delegate_executor']);

export interface IDroxAgentsChatProgressSink {
	(parts: IChatProgress[]): void;
}

export interface IDroxAgentsChatSink extends IDroxAgentEventSink {
	readonly assistantText: string;
}

interface IPendingTool {
	readonly name: string;
	readonly args: unknown;
}

/** Strip moteur / protocole — aligné webview `stripProtocolMarkers`. */
export function stripDroxAgentsProtocolMarkers(text: string): string {
	return String(text || '')
		.replace(/\[discussion:\s*reply\]\s*/gi, '')
		.replace(/\[discussion:\s*done\]\s*/gi, '')
		.replace(/\[phase:\s*(?:answering|done)\]\s*/gi, '')
		.replace(/\{[^{}]*"(?:gate|open)"\s*:\s*[^}]+\}/gi, '');
}

export function sanitizeDroxAgentsChatDeltaChunk(text: string): string {
	const stripped = stripDroxAgentsProtocolMarkers(text);
	return stripped.trim().length > 0 ? stripped : '';
}

/** Corps réponse après le dernier `[phase: answering]` — aligné webview `extractAnsweringOnlyText`. */
export function extractDroxAgentsAnsweringOnlyText(text: string): string {
	const raw = String(text || '');
	const lines = raw.split('\n');
	let lastAnsweringIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*\[phase:\s*answering\]\s*$/i.test(lines[i])) {
			lastAnsweringIdx = i;
		}
	}
	if (lastAnsweringIdx >= 0) {
		let body = lines.slice(lastAnsweringIdx + 1);
		const doneIdx = body.findIndex(line => /^\s*\[phase:\s*done\]\s*$/i.test(line));
		if (doneIdx >= 0) {
			body = body.slice(0, doneIdx);
		}
		return stripDroxAgentsProtocolMarkers(body.join('\n')).trim();
	}
	return stripDroxAgentsProtocolMarkers(raw).trim();
}

export function shouldPreferDroxAgentsStreamOverCanonicalReply(existingText: string, reply: string): boolean {
	const existing = String(existingText || '').trim();
	const canon = String(reply || '').trim();
	if (!existing || !canon) {
		return false;
	}
	if (isBrokenDroxAgentsCanonicalReply(canon)) {
		return existing.length > canon.length;
	}
	if (existing.length > canon.length && existing.includes(canon)) {
		return true;
	}
	if (canon.length < existing.length * 0.6) {
		return true;
	}
	return false;
}

function isBrokenDroxAgentsCanonicalReply(text: string): boolean {
	const t = String(text || '').trim();
	if (!t) {
		return true;
	}
	if (t.length < 8 && /[`'"]/.test(t)) {
		return true;
	}
	if (/^\d+\.\s+Then\s*`?$/i.test(t)) {
		return true;
	}
	return false;
}

export interface IDroxAgentsChatTodoListItem {
	readonly id: string;
	readonly title: string;
	readonly status: 'not-started' | 'in-progress' | 'completed';
}

export interface IDroxAgentsChatSinkContext {
	readonly workspaceRoot?: string;
	readonly fileService?: IFileService;
	readonly runRevertService?: IDroxRunRevertService;
	readonly recordUiReplay?: (message: DroxHostToWebviewMessage) => void;
	readonly onFileChangeApplied?: (change: IDroxFileChangePayload) => void;
	/**
	 * 1.5.17 — fin de `agent.run` (contrat TUI run-centric) : l’enveloppe IDE
	 * doit arrêter le plan session « vivant » (clear force), quel que soit le status.
	 */
	readonly onAgentRunEnded?: () => void;
	/**
	 * Pendant le run : chaque `todo_write` réussi doit alimenter le widget plan
	 * (IChatTodoListService) — le constructeur Copilot ne re-lit pas un update tardif.
	 */
	readonly onTodosUpdated?: (todoList: readonly IDroxAgentsChatTodoListItem[]) => void;
}

/** Mappe le payload moteur vers le format widget Copilot (`todoList` toolSpecificData). */
export function mapDroxTodosToAgentsChatTodoList(
	todos: readonly { id: string; content: string; status: string }[],
): IDroxAgentsChatTodoListItem[] {
	return todos.map(t => {
		// Copilot n’a pas de statut `cancelled` (AMB-03) — on le surface dans le titre.
		const cancelled = t.status === 'cancelled';
		return {
			id: t.id,
			title: cancelled ? `${t.content} · cancelled` : t.content,
			status: t.status === 'completed' ? 'completed' as const
				: t.status === 'in_progress' ? 'in-progress' as const
					: 'not-started' as const,
		};
	});
}

export function createDroxAgentsChatSink(
	progress: IDroxAgentsChatProgressSink,
	context?: IDroxAgentsChatSinkContext,
): IDroxAgentsChatSink {
	let currentPhase: string | null = null;
	let answerText = '';
	let runEnded = false;
	const pendingTools = new Map<string, IPendingTool>();
	/** Child Explore tools → parent `task` toolCallId. */
	const nestedChildParents = new Map<string, string>();
	/** Accumulated Explore thinking notes per parent `task` id. */
	const nestedChildNotes = new Map<string, string>();
	const nestedChildNotesLastPush = new Map<string, number>();
	const record = context?.recordUiReplay;

	const recordWire = (message: DroxHostToWebviewMessage): void => {
		record?.(message);
	};

	const push = (parts: IChatProgress[]): void => {
		progress(parts);
	};

	const pushRunWarmup = (): void => {
		push([{
			kind: 'droxWarmup',
			phrase: pickDroxWarmupPhrase(),
		}]);
	};

	pushRunWarmup();

	const pushMarkdownDelta = (text: string): void => {
		const chunk = sanitizeDroxAgentsChatDeltaChunk(text);
		if (!chunk) {
			return;
		}
		push([{
			kind: 'markdownContent',
			content: new MarkdownString(chunk),
		}]);
	};

	const pushThinkingDelta = (text: string): void => {
		const chunk = sanitizeDroxAgentsChatDeltaChunk(text);
		if (!chunk) {
			return;
		}
		push([{
			kind: 'thinking',
			value: chunk,
		}]);
	};

	const pushTextDelta = (text: string): void => {
		const chunk = sanitizeDroxAgentsChatDeltaChunk(text);
		if (!chunk) {
			return;
		}
		if (isDroxThinkingRoute(currentPhase)) {
			pushThinkingDelta(chunk);
			recordWire({ kind: 'delta', text: chunk });
			return;
		}
		answerText += chunk;
		pushMarkdownDelta(chunk);
		recordWire({ kind: 'delta', text: chunk });
	};

	const applyUserFacingReply = (raw: string): void => {
		const reply = extractDroxAgentsAnsweringOnlyText(raw);
		if (!reply) {
			return;
		}
		recordWire({ kind: 'userFacingReply', text: raw });
		if (shouldPreferDroxAgentsStreamOverCanonicalReply(answerText, reply)) {
			return;
		}
		const trimmedAnswer = answerText.trim();
		if (trimmedAnswer === reply || trimmedAnswer.endsWith(reply)) {
			return;
		}
		if (reply.startsWith(answerText)) {
			const suffix = reply.slice(answerText.length);
			if (suffix) {
				answerText = reply;
				pushMarkdownDelta(suffix);
			}
			return;
		}
		if (!trimmedAnswer) {
			answerText = reply;
			pushMarkdownDelta(reply);
		}
	};

	const pushToolStart = (id: string, name: string, args: unknown): void => {
		if (SKIP_TOOL_UI.has(name) || isFileMutationToolName(name)) {
			return;
		}
		const { verb, target } = describeToolCall(name, args);
		const shellStart = buildShellToolStartWire(name, args);
		const exploreStart = buildExploreToolStartWire(name, args);
		const label = exploreStart?.exploreTitle
			?? (shellStart
				? formatShellToolDisplayLabel(shellStart.shellCommand, shellStart.shellDescription)
				: (target ? `${verb} ${target}` : verb));
		const toolSpecificData = shellStart
			? buildAgentsShellTerminalToolSpecificData(shellStart)
			: exploreStart
				? buildExploreSubagentToolSpecificData(exploreStart)
				: undefined;
		push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: id,
			toolName: name,
			isComplete: false,
			invocationMessage: label,
			toolSpecificData,
		}]);
		const argsPreview = previewJson(args);
		recordWire({
			kind: 'tool',
			phase: 'start',
			id,
			name,
			verb,
			target,
			argsPreview,
			...shellStart,
			...exploreStart,
		});
	};

	const pushToolProgress = (id: string, name: string | undefined, outputPreview: string, elapsedMs: number): void => {
		const pending = pendingTools.get(id);
		const toolName = name || pending?.name;
		if (!toolName || toolName !== 'task') {
			return;
		}
		const exploreStart = buildExploreToolStartWire(toolName, pending?.args);
		if (!exploreStart) {
			return;
		}
		const live = String(outputPreview || '').trimEnd();
		if (!live) {
			return;
		}
		const notes = nestedChildNotes.get(id);
		const liveResult = notes
			? ((live.includes('--- notes ---') || live.includes('--- report ---'))
				? live
				: `${live}\n--- notes ---\n${notes}`)
			: live;
		const sec = elapsedMs > 0 ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : '';
		push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: id,
			toolName,
			isComplete: false,
			invocationMessage: localize('droxAgents.exploreRunning', 'Explore{0}', sec),
			toolSpecificData: buildExploreSubagentToolSpecificData(exploreStart, undefined, liveResult),
		}]);
		recordWire({
			kind: 'tool',
			phase: 'progress',
			id,
			name: toolName,
			outputPreview: liveResult,
			elapsedMs,
			exploreTitle: exploreStart.exploreTitle,
			exploreDescription: exploreStart.exploreDescription,
			exploreThoroughness: exploreStart.exploreThoroughness,
		});
	};

	const pushNestedChildToolStart = (parentId: string, childId: string, name: string, args: unknown): void => {
		const parent = pendingTools.get(parentId);
		if (!parent || parent.name !== 'task') {
			return;
		}
		nestedChildParents.set(childId, parentId);
		pendingTools.set(childId, { name, args });
		const { verb, target } = describeToolCall(name, args);
		const label = target ? `${verb} ${target}` : verb;
		push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: childId,
			toolName: name,
			isComplete: false,
			invocationMessage: label,
			subagentInvocationId: parentId,
		}]);
		recordWire({
			kind: 'tool',
			phase: 'start',
			id: childId,
			name,
			verb,
			target,
			argsPreview: previewJson(args),
			parentToolId: parentId,
		});
	};

	const pushNestedChildToolFinish = (parentId: string, childId: string, output: unknown, isError: boolean): void => {
		const pending = pendingTools.get(childId);
		pendingTools.delete(childId);
		nestedChildParents.delete(childId);
		const name = pending?.name || '?';
		const preview = previewJson(output);
		const { verb, target } = describeToolCall(name, pending?.args);
		const label = target ? `${verb} ${target}` : verb;
		push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: childId,
			toolName: name,
			isComplete: true,
			errorMessage: isError ? (preview || localize('droxAgents.toolFailed', 'Tool failed')) : undefined,
			pastTenseMessage: isError
				? localize('droxAgents.nestedToolError', 'Failed: {0}', label)
				: localize('droxAgents.nestedToolDone', '{0}', label),
			subagentInvocationId: parentId,
		}]);
		recordWire({
			kind: 'tool',
			phase: 'finish',
			id: childId,
			name,
			outputPreview: preview,
			isError,
			parentToolId: parentId,
		});
	};

	const pushNestedChildTextDelta = (parentId: string, text: string): void => {
		const parent = pendingTools.get(parentId);
		if (!parent || parent.name !== 'task' || !text) {
			return;
		}
		const exploreStart = buildExploreToolStartWire(parent.name, parent.args);
		if (!exploreStart) {
			return;
		}
		const prev = nestedChildNotes.get(parentId) || '';
		const next = prev + text;
		nestedChildNotes.set(parentId, next);
		const now = Date.now();
		const last = nestedChildNotesLastPush.get(parentId) ?? 0;
		if (now - last < 120 && next.length - prev.length < 80) {
			return;
		}
		nestedChildNotesLastPush.set(parentId, now);
		push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: parentId,
			toolName: 'task',
			isComplete: false,
			invocationMessage: localize('droxAgents.exploreRunning', 'Explore{0}', ''),
			toolSpecificData: buildExploreSubagentToolSpecificData(
				exploreStart,
				undefined,
				`--- notes ---\n${next}`,
			),
		}]);
	};

	const pushFileMutationFinish = (
		id: string,
		name: string | undefined,
		output: unknown,
		isError: boolean,
		pendingArgs: unknown | undefined,
	): void => {
		if (!name || !isFileMutationToolName(name) || !context?.fileService || !context.runRevertService) {
			return;
		}
		void (async () => {
			const resolution = await resolveDroxFileChangeAfterToolFinish(
				{ fileService: context.fileService!, runRevertService: context.runRevertService! },
				{
					workspaceRoot: context.workspaceRoot,
					pendingName: name,
					output,
					isError,
					toolId: id,
					pendingArgs,
				},
			);
			if (!resolution) {
				return;
			}
			push(fileChangeResolutionToChatProgress(resolution));
			const tid = String(resolution.change.toolId || id).trim();
			recordWire(asFileChangeHostMessage(resolution.change, tid || undefined));
			context?.onFileChangeApplied?.(resolution.change);
		})();
	};

	const pushToolFinish = (id: string, name: string | undefined, output: unknown, isError: boolean, pendingArgs?: unknown): void => {
		if (name === 'todo_write' || (!name && isTodoWriteOutput(output))) {
			if (!isError) {
				const todos = extractTodosFromToolOutput(output);
				if (todos) {
					const todoList = mapDroxTodosToAgentsChatTodoList(todos);
					push([{
						kind: 'externalToolInvocationUpdate',
						toolCallId: id,
						toolName: 'todo_write',
						isComplete: true,
						toolSpecificData: {
							kind: 'todoList',
							todoList,
						},
					}]);
					try {
						context?.onTodosUpdated?.(todoList);
					} catch {
						// Ne pas casser le fil tool si le widget plan échoue.
					}
					recordWire({
						kind: 'tool',
						phase: 'finish',
						id,
						name: 'todo_write',
						outputPreview: previewJson(output),
						isError: false,
					});
				}
			}
			return;
		}
		if (!name || SKIP_TOOL_UI.has(name)) {
			return;
		}
		if (isFileMutationToolName(name)) {
			pushFileMutationFinish(id, name, output, isError, pendingArgs);
			return;
		}
		const preview = previewJson(output);
		const shellStart = buildShellToolStartWire(name, pendingArgs);
		const shellOutput = buildShellToolFinishWire(name, output, isError);
		if (shellStart) {
			const label = formatShellToolDisplayLabel(shellStart.shellCommand, shellStart.shellDescription);
			const skipped = Boolean(shellOutput?.skipped);
			push([{
				kind: 'externalToolInvocationUpdate',
				toolCallId: id,
				toolName: name,
				isComplete: true,
				errorMessage: isError && !skipped
					? (shellOutput?.error || preview || localize('droxAgents.toolFailed', 'Tool failed'))
					: undefined,
				pastTenseMessage: skipped
					? localize('droxAgents.shellSkipped', 'Skipped: {0}', label)
					: isError
						? localize('droxAgents.shellError', 'Failed: {0}', label)
						: localize('droxAgents.shellDone', 'Ran {0}', label),
				toolSpecificData: buildAgentsShellTerminalToolSpecificData(shellStart, shellOutput, isError),
			}]);
			recordWire({
				kind: 'tool',
				phase: 'finish',
				id,
				name,
				outputPreview: preview,
				isError,
				shellKind: shellStart.shellKind,
				shellCommand: shellStart.shellCommand,
				shellDescription: shellStart.shellDescription,
				shellOutput,
			});
			return;
		}
		const exploreStart = buildExploreToolStartWire(name, pendingArgs);
		const exploreOutput = buildExploreToolFinishWire(name, output, isError);
		if (exploreStart || exploreOutput) {
			const start = exploreStart ?? {
				exploreTitle: localize('droxAgents.exploreDefault', 'Explore'),
				exploreDescription: localize('droxAgents.exploreDefault', 'Explore'),
			};
			const report = exploreOutput?.exploreReport || exploreOutput?.exploreError || preview;
			push([{
				kind: 'externalToolInvocationUpdate',
				toolCallId: id,
				toolName: name,
				isComplete: true,
				errorMessage: isError
					? (exploreOutput?.exploreError || preview || localize('droxAgents.toolFailed', 'Tool failed'))
					: undefined,
				pastTenseMessage: isError
					? localize('droxAgents.exploreError', 'Explore error: {0}', exploreOutput?.exploreError || preview || name)
					: localize('droxAgents.exploreDone', 'Explore completed'),
				toolSpecificData: buildExploreSubagentToolSpecificData(start, {
					exploreReport: report || undefined,
					exploreReportPath: exploreOutput?.exploreReportPath,
					exploreError: exploreOutput?.exploreError,
					exploreThoroughness: exploreOutput?.exploreThoroughness,
				}),
			}]);
			recordWire({
				kind: 'tool',
				phase: 'finish',
				id,
				name,
				outputPreview: preview,
				isError,
				exploreTitle: start.exploreTitle,
				exploreDescription: start.exploreDescription,
				exploreThoroughness: start.exploreThoroughness ?? exploreOutput?.exploreThoroughness,
				exploreOutput,
			});
			return;
		}
		push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: id,
			toolName: name,
			isComplete: true,
			errorMessage: isError ? (preview || localize('droxAgents.toolFailed', 'Tool failed')) : undefined,
			pastTenseMessage: isError
				? localize('droxAgents.toolError', 'Tool error: {0}', preview || name)
				: localize('droxAgents.toolDone', 'Tool result: {0}', preview || name),
		}]);
		recordWire({
			kind: 'tool',
			phase: 'finish',
			id,
			name,
			outputPreview: preview,
			isError,
		});
	};

	return {
		get assistantText() {
			return answerText;
		},
		handleAgentEvent(params: unknown): void {
			const ev = (params as { event?: Record<string, unknown> } | undefined)?.event;
			if (!ev || typeof ev.kind !== 'string') {
				return;
			}
			switch (ev.kind) {
				case 'phase_enter':
					if (typeof ev.phase === 'string') {
						currentPhase = ev.phase === 'done' ? null : ev.phase;
						recordWire({ kind: 'phase', phase: ev.phase });
					}
					return;
				case 'phase_close':
					currentPhase = null;
					recordWire({ kind: 'phase', close: true });
					return;
				case 'text_delta':
					if (typeof ev.text === 'string' && ev.text.length > 0) {
						pushTextDelta(ev.text);
					}
					return;
				case 'user_facing_reply':
					if (typeof ev.text === 'string' && ev.text.length > 0) {
						applyUserFacingReply(ev.text);
					}
					return;
				case 'tool_start': {
					const name = typeof ev.name === 'string' ? ev.name : '?';
					const id = ev.id != null ? String(ev.id) : generateToolId(name);
					const args = 'arguments' in ev ? ev.arguments : undefined;
					if (id) {
						pendingTools.set(id, { name, args });
					}
					pushToolStart(id, name, args);
					return;
				}
				case 'tool_progress': {
					const id = ev.id != null ? String(ev.id) : '?';
					const name = typeof ev.name === 'string' ? ev.name : undefined;
					const full = typeof ev.full_output === 'string'
						? ev.full_output
						: (typeof ev.fullOutput === 'string' ? ev.fullOutput : '');
					const output = typeof ev.output === 'string' ? ev.output : '';
					const elapsedMs = Number(ev.elapsed_ms ?? ev.elapsedMs ?? 0);
					pushToolProgress(id, name, full || output, elapsedMs);
					return;
				}
				case 'subagent_child_tool_start': {
					const parentId = String(ev.parent_id ?? ev.parentId ?? '');
					const childId = ev.id != null ? String(ev.id) : generateToolId(String(ev.name ?? 'tool'));
					const name = typeof ev.name === 'string' ? ev.name : '?';
					const args = 'arguments' in ev ? ev.arguments : undefined;
					if (parentId && childId) {
						pushNestedChildToolStart(parentId, childId, name, args);
					}
					return;
				}
				case 'subagent_child_tool_finish': {
					const parentId = String(ev.parent_id ?? ev.parentId ?? nestedChildParents.get(String(ev.id ?? '')) ?? '');
					const childId = ev.id != null ? String(ev.id) : '?';
					const output = 'output' in ev ? ev.output : undefined;
					const isError = Boolean(ev.is_error ?? ev.isError);
					if (parentId && childId) {
						pushNestedChildToolFinish(parentId, childId, output, isError);
					}
					return;
				}
				case 'subagent_child_text_delta': {
					const parentId = String(ev.parent_id ?? ev.parentId ?? '');
					const text = typeof ev.text === 'string' ? ev.text : '';
					if (parentId && text) {
						pushNestedChildTextDelta(parentId, text);
					}
					return;
				}
				case 'tool_finish': {
					const id = ev.id != null ? String(ev.id) : '?';
					const output = 'output' in ev ? ev.output : undefined;
					const isError = Boolean(ev.is_error ?? ev.isError);
					const pending = pendingTools.get(id);
					pendingTools.delete(id);
					nestedChildNotes.delete(id);
					pushToolFinish(id, pending?.name, output, isError, pending?.args);
					return;
				}
				default:
					return;
			}
		},
		handleAgentDone(params: unknown): void {
			if (runEnded) {
				return;
			}
			runEnded = true;
			const p = params as { status?: string; error?: string } | undefined;
			const orphanReason = p?.status === 'cancelled'
				? localize('droxAgents.runCancelled', 'Run cancelled')
				: p?.status === 'error'
					? (p.error?.trim() || localize('droxAgents.toolFailed', 'Tool failed'))
					: localize('droxAgents.runEndedOrphan', 'Run ended without tool result');
			// Rescue tool_use orphelins (ex. Sync Explore aborté sans tool_finish).
			for (const [id, pending] of Array.from(pendingTools.entries())) {
				pendingTools.delete(id);
				nestedChildNotes.delete(id);
				pushToolFinish(id, pending.name, orphanReason, true, pending.args);
			}
			if (p?.status === 'error' && p.error) {
				const text = formatDroxAgentsLoopAbortMessage(p.error);
				push([{
					kind: 'markdownContent',
					content: new MarkdownString(text),
				}]);
				recordWire({ kind: 'append', role: 'error', text });
			}
			currentPhase = null;
			pendingTools.clear();
			nestedChildParents.clear();
			nestedChildNotes.clear();
			nestedChildNotesLastPush.clear();
			// Contrat TUI : fin de run = plus de plan UI actif (completed / error / cancel).
			try {
				context?.onAgentRunEnded?.();
			} catch {
				// Ne pas masquer la fin de run si le clear widget échoue.
			}
		},
	};
}

function generateToolId(name: string): string {
	return `drox-tool-${name}-${Date.now()}`;
}

export function shouldHandleDroxAgentsEngineNotification(
	activeRunId: string | undefined,
	method: string,
	params: unknown,
): boolean {
	if (!activeRunId) {
		return false;
	}
	if (method !== 'agent/event' && method !== 'agent/done') {
		return false;
	}
	const runId = extractAgentNotificationRunId(params);
	return runId === activeRunId;
}

