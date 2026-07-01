/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IChatProgress } from '../../../chat/common/chatService/chatService.js';
import { IChatRequestVariableData } from '../../../chat/common/model/chatModel.js';
import { IChatSessionHistoryItem } from '../../../chat/common/chatSessionsService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { buildShellToolStartWire } from '../../common/chat/droxShellToolWire.js';
import { fileChangeResolutionToChatProgress } from '../../common/droxFileChangeProgress.js';
import { DroxFileChangeHostMessage } from '../../common/droxFileChange.js';
import { uiReplayImagesToVariableData } from '../../common/droxNativeChatRequestAttachments.js';
import { isFileMutationToolName } from '../../common/droxFileMutation.js';
import { describeToolCall, previewJson } from '../../common/droxToolPreview.js';
import { extractTodosFromToolOutput, isTodoWriteOutput } from '../../common/droxTodoExtract.js';
import { DROX_AGENT_ID } from '../../common/droxAgentsSession.js';
import { IDroxTranscriptMessage, transcriptMessageToReplayAppends } from '../../common/droxSession.js';
import {
	extractDroxAgentsAnsweringOnlyText,
	sanitizeDroxAgentsChatDeltaChunk,
	shouldPreferDroxAgentsStreamOverCanonicalReply,
} from './droxAgentsChatSink.js';

const SKIP_TOOL_UI = new Set(['course_plan_write', 'scope_defer', 'delegate_executor']);

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

class DroxAgentsUiReplayCollector {

	private _phase: string | null = null;
	private _answerText = '';
	private readonly _parts: IChatProgress[];

	constructor(parts: IChatProgress[]) {
		this._parts = parts;
	}

	reset(): void {
		this._phase = null;
		this._answerText = '';
	}

	apply(message: DroxHostToWebviewMessage): void {
		switch (message.kind) {
			case 'phase':
				if (message.close) {
					this._phase = null;
				} else if (message.phase) {
					this._phase = message.phase;
				}
				break;
			case 'delta':
				this._pushTextDelta(message.text);
				break;
			case 'userFacingReply':
				this._applyUserFacingReply(message.text);
				break;
			case 'clearAssistant':
				this._answerText = '';
				break;
			case 'tool':
				this._applyTool(message);
				break;
			case 'fileChange':
				this._applyFileChange(message);
				break;
			case 'append':
				if (message.role === 'assistant') {
					this._pushMarkdown(message.text);
				} else if (message.role === 'error') {
					this._pushMarkdown(`**${localize('droxAgents.replayError', 'Error')}:** ${message.text}`);
				}
				break;
			default:
				break;
		}
	}

	private _push(parts: IChatProgress[]): void {
		this._parts.push(...parts);
	}

	private _pushMarkdown(text: string): void {
		const chunk = sanitizeDroxAgentsChatDeltaChunk(text);
		if (!chunk) {
			return;
		}
		this._answerText += chunk;
		this._push([{ kind: 'markdownContent', content: new MarkdownString(chunk) }]);
	}

	private _pushTextDelta(text: string): void {
		const chunk = sanitizeDroxAgentsChatDeltaChunk(text);
		if (!chunk) {
			return;
		}
		if (isThinkingRoute(this._phase)) {
			this._push([{ kind: 'thinking', value: chunk }]);
			return;
		}
		this._answerText += chunk;
		this._push([{ kind: 'markdownContent', content: new MarkdownString(chunk) }]);
	}

	private _applyUserFacingReply(raw: string): void {
		const reply = extractDroxAgentsAnsweringOnlyText(raw);
		if (!reply || shouldPreferDroxAgentsStreamOverCanonicalReply(this._answerText, reply)) {
			return;
		}
		const trimmedAnswer = this._answerText.trim();
		if (trimmedAnswer === reply || trimmedAnswer.endsWith(reply)) {
			return;
		}
		if (reply.startsWith(this._answerText)) {
			const suffix = reply.slice(this._answerText.length);
			if (suffix) {
				this._answerText = reply;
				this._push([{ kind: 'markdownContent', content: new MarkdownString(suffix) }]);
			}
			return;
		}
		if (!trimmedAnswer) {
			this._answerText = reply;
			this._push([{ kind: 'markdownContent', content: new MarkdownString(reply) }]);
		}
	}

	private _applyTool(message: Extract<DroxHostToWebviewMessage, { kind: 'tool' }>): void {
		const id = message.id;
		if (message.phase === 'start') {
			const name = message.name ?? 'tool';
			if (SKIP_TOOL_UI.has(name) || isFileMutationToolName(name)) {
				return;
			}
			const argsPreview = message.argsPreview;
			let args: unknown = argsPreview;
			if (typeof argsPreview === 'string') {
				try {
					args = JSON.parse(argsPreview);
				} catch {
					args = argsPreview;
				}
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
			this._push([{
				kind: 'externalToolInvocationUpdate',
				toolCallId: id,
				toolName: name,
				isComplete: false,
				invocationMessage: label,
				toolSpecificData,
			}]);
			return;
		}
		if (message.phase !== 'finish') {
			return;
		}
		const name = message.name;
		const output = message.outputPreview ?? '';
		const isError = Boolean(message.isError);
		if (name === 'todo_write' || (!name && isTodoWriteOutput(output))) {
			if (!isError) {
				const todos = extractTodosFromToolOutput(output);
				if (todos) {
					this._push([{
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
		if (!name || SKIP_TOOL_UI.has(name) || isFileMutationToolName(name)) {
			return;
		}
		const preview = previewJson(output);
		this._push([{
			kind: 'externalToolInvocationUpdate',
			toolCallId: id,
			toolName: name,
			isComplete: true,
			errorMessage: isError ? (preview || localize('droxAgents.toolFailed', 'Tool failed')) : undefined,
			pastTenseMessage: isError
				? localize('droxAgents.toolError', 'Tool error: {0}', preview || name)
				: localize('droxAgents.toolDone', 'Tool result: {0}', preview || name),
		}]);
	}

	private _applyFileChange(message: DroxFileChangeHostMessage): void {
		const change = {
			op: message.op,
			path: message.path,
			relPath: message.relPath,
			added: message.added,
			removed: message.removed,
			diff: message.diff,
			content: message.content,
			language: message.language,
			applied: message.applied,
			cancelled: message.cancelled,
			proposed: message.proposed,
			toolId: message.toolId,
			canUndo: message.canUndo,
		};
		this._push(fileChangeResolutionToChatProgress({
			change,
			canUndo: Boolean(message.canUndo && message.toolId),
		}));
	}
}

/**
 * Rebuilds VS Code Agents chat history from a Drox UI replay journal.
 */
export function buildDroxAgentsHistoryFromUiReplay(
	journal: readonly DroxHostToWebviewMessage[],
	participant: string = DROX_AGENT_ID,
): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	const responseParts: IChatProgress[] = [];
	const collector = new DroxAgentsUiReplayCollector(responseParts);
	let pendingUserPrompt: string | undefined;

	const flushResponse = (): void => {
		if (responseParts.length > 0) {
			history.push({ type: 'response', parts: [...responseParts], participant });
			responseParts.length = 0;
			collector.reset();
		}
	};

	const flushRequest = (prompt: string, variableData?: IChatRequestVariableData): void => {
		flushResponse();
		const trimmed = prompt.trim();
		if (trimmed || (variableData?.variables.length ?? 0) > 0) {
			history.push({
				type: 'request',
				prompt: trimmed,
				participant,
				variableData,
			});
		}
	};

	for (const message of journal) {
		if (message.kind === 'replayPrepare') {
			flushResponse();
			collector.reset();
			pendingUserPrompt = undefined;
			continue;
		}
		if (message.kind === 'userPromptSticky') {
			pendingUserPrompt = message.fullText || message.text;
			continue;
		}
		if (message.kind === 'append' && message.role === 'user') {
			const prompt = pendingUserPrompt ?? message.text ?? '';
			pendingUserPrompt = undefined;
			const variableData = message.images?.length
				? uiReplayImagesToVariableData(message.images)
				: undefined;
			flushRequest(prompt, variableData);
			continue;
		}
		collector.apply(message);
	}

	flushResponse();
	return history;
}

/**
 * Fallback when no `.ui-replay.jsonl` exists — light transcript user/assistant pairs.
 */
export function buildDroxAgentsHistoryFromTranscript(
	messages: readonly IDroxTranscriptMessage[],
	participant: string = DROX_AGENT_ID,
): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	let responseParts: IChatProgress[] = [];

	const flushResponse = (): void => {
		if (responseParts.length > 0) {
			history.push({ type: 'response', parts: responseParts, participant });
			responseParts = [];
		}
	};

	for (const message of messages) {
		for (const append of transcriptMessageToReplayAppends(message)) {
			if (append.role === 'user') {
				flushResponse();
				history.push({ type: 'request', prompt: append.text, participant });
			} else if (append.role === 'assistant') {
				const text = sanitizeDroxAgentsChatDeltaChunk(append.text);
				if (text) {
					responseParts.push({ kind: 'markdownContent', content: new MarkdownString(text) });
				}
			}
		}
	}

	flushResponse();
	return history;
}
