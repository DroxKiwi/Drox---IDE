/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IFileService } from '../../../../../platform/files/common/files.js';
import { localize } from '../../../../../nls.js';
import { IChatProgress } from '../../../chat/common/chatService/chatService.js';
import { buildShellToolStartWire } from '../../common/chat/droxShellToolWire.js';
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
import { asFileChangeHostMessage } from '../../common/droxFileChange.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { extractAgentNotificationRunId } from '../droxChatAgentEvents.js';

const SKIP_TOOL_UI = new Set(['course_plan_write', 'scope_defer', 'delegate_executor']);

/** Phases moteur dont le texte streamé ne doit pas apparaître dans la réponse utilisateur. */
const THINKING_PHASES = new Set([
	'internal_reasoning',
	'reasoning',
	'reading',
	'analyzing',
	'acting',
	'planning',
	'verifying',
	'testing',
	'clarifying',
]);

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

function isAnsweringPhase(phase: string | null): boolean {
	return phase === 'answering';
}

function isThinkingRoute(phase: string | null): boolean {
	if (isAnsweringPhase(phase)) {
		return false;
	}
	if (!phase) {
		return true;
	}
	return THINKING_PHASES.has(phase) || phase !== 'done';
}

export interface IDroxAgentsChatSinkContext {
	readonly workspaceRoot?: string;
	readonly fileService?: IFileService;
	readonly runRevertService?: IDroxRunRevertService;
	readonly recordUiReplay?: (message: DroxHostToWebviewMessage) => void;
	readonly onFileChangeApplied?: (change: IDroxFileChangePayload) => void;
}

export function createDroxAgentsChatSink(
	progress: IDroxAgentsChatProgressSink,
	context?: IDroxAgentsChatSinkContext,
): IDroxAgentsChatSink {
	let currentPhase: string | null = null;
	let answerText = '';
	const pendingTools = new Map<string, IPendingTool>();
	const record = context?.recordUiReplay;

	const recordWire = (message: DroxHostToWebviewMessage): void => {
		record?.(message);
	};

	const push = (parts: IChatProgress[]): void => {
		progress(parts);
	};

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
		if (isThinkingRoute(currentPhase)) {
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
		const label = target ? `${verb} ${target}` : verb;
		const shellStart = buildShellToolStartWire(name, args);
		const toolSpecificData = shellStart ? {
			kind: 'terminal' as const,
			language: shellStart.shellKind,
			commandLine: {
				original: shellStart.shellCommand,
				forDisplay: shellStart.shellDescription ?? shellStart.shellCommand,
			},
		} : undefined;
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
		});
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
					push([{
						kind: 'externalToolInvocationUpdate',
						toolCallId: id,
						toolName: 'todo_write',
						isComplete: true,
						toolSpecificData: {
							kind: 'todoList',
							todoList: todos.map(t => ({
								id: t.id,
								title: t.content,
								status: t.status === 'completed' ? 'completed' as const
									: t.status === 'in_progress' ? 'in-progress' as const
										: 'not-started' as const,
							})),
						},
					}]);
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
				case 'tool_finish': {
					const id = ev.id != null ? String(ev.id) : '?';
					const output = 'output' in ev ? ev.output : undefined;
					const isError = Boolean(ev.is_error ?? ev.isError);
					const pending = pendingTools.get(id);
					pendingTools.delete(id);
					pushToolFinish(id, pending?.name, output, isError, pending?.args);
					return;
				}
				default:
					return;
			}
		},
		handleAgentDone(params: unknown): void {
			const p = params as { status?: string; error?: string } | undefined;
			if (p?.status === 'error' && p.error) {
				push([{
					kind: 'markdownContent',
					content: new MarkdownString(p.error),
				}]);
				recordWire({ kind: 'append', role: 'error', text: p.error });
			}
			currentPhase = null;
			pendingTools.clear();
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

