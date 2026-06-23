/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { isFileMutationToolName } from '../common/droxFileMutation.js';
import { IDroxTranscriptContentBlock, IDroxTranscriptMessage, transcriptMessageToReplayAppends } from '../common/droxSession.js';
import { describeToolCall, previewJson } from '../common/droxToolPreview.js';
import { buildShellToolFinishWire, buildShellToolStartWire } from '../common/chat/droxShellToolWire.js';
import { extractTodoErrorMessage, extractTodosFromToolOutput, isTodoWriteOutput } from '../common/droxTodoExtract.js';
import { DroxHostToWebviewMessage } from './droxChatBridge.js';
import { IDroxChatAgentEventHost } from './droxChatAgentEvents.js';
import type { IDroxChatTabsDelegate } from './chat/droxChatTabsManager.js';

const REPLAY_LIGHT_MESSAGE_THRESHOLD = 400;
const REPLAY_YIELD_EVERY = 6;
const REPLAY_YIELD_MS = 48;

const SKIP_TOOL_UI = new Set(['course_plan_write', 'scope_defer']);
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
const IGNORED_PHASES = new Set(['reasoning', 'next-move']);
const PHASE_LINE_RE = /^\[phase:\s*([^\]]+)\]\s*$/i;

function textFromBlocks(blocks: readonly IDroxTranscriptContentBlock[]): string {
	return blocks
		.filter(c => c.type === 'text' && typeof c.text === 'string')
		.map(c => c.text!)
		.join('\n')
		.trim();
}

function shouldSkipTranscriptSystem(text: string): boolean {
	const t = text.trim();
	if (!t) {
		return true;
	}
	if (t.includes('[Old tool result content cleared]')) {
		return true;
	}
	if (/^\[tool\b/i.test(t) || /^\[outil\]/i.test(t) || /^\[résultat outil/i.test(t)) {
		return true;
	}
	if (/\[drox:/i.test(t) && /(outil|tool_result|JSON ci-dessous)/i.test(t)) {
		return true;
	}
	return false;
}

function replayAssistantTextWithPhases(host: IDroxChatAgentEventHost, text: string): void {
	const lines = text.split(/\r?\n/);
	let buffer: string[] = [];
	let replayPhase: string | null = null;
	const flush = () => {
		const chunk = buffer.join('\n').trim();
		if (chunk) {
			if (replayPhase === 'answering') {
				host.post({ kind: 'delta', text: chunk });
			} else {
				host.post({ kind: 'append', role: 'assistant', text: chunk });
			}
		}
		buffer = [];
	};
	for (const line of lines) {
		const m = line.match(PHASE_LINE_RE);
		if (m) {
			flush();
			const phase = m[1].trim().toLowerCase();
			if (phase === 'done') {
				replayPhase = null;
				host.post({ kind: 'phase', close: true });
				host.post({ kind: 'phase', phase: 'done' });
			} else if (phase === 'answering') {
				replayPhase = 'answering';
				host.post({ kind: 'phase', close: true });
				host.post({ kind: 'phase', phase: 'answering' });
			} else if (!IGNORED_PHASES.has(phase)) {
				replayPhase = phase;
				host.post({ kind: 'phase', close: true });
				host.post({ kind: 'phase', phase });
			}
			continue;
		}
		buffer.push(line);
	}
	flush();
}

function replayToolStart(host: IDroxChatAgentEventHost, id: string, name: string, args: unknown): void {
	const toolId = id || '?';
	const toolName = name || '?';
	if (toolName === 'delegate_executor') {
		if (toolId !== '?') {
			host.setPendingTool(toolId, { name: toolName, args });
		}
		return;
	}
	if (toolId !== '?') {
		host.setPendingTool(toolId, { name: toolName, args });
	}
	if (toolName === 'todo_write' || SKIP_TOOL_UI.has(toolName)) {
		return;
	}
	const isFileMutation = isFileMutationToolName(toolName);
	if (isFileMutation) {
		return;
	}
	const skipArgsPreview = SKIP_TOOL_PREVIEW_NAMES.has(toolName);
	const shellStart = buildShellToolStartWire(toolName, args);
	const { verb, target } = describeToolCall(toolName, args);
	host.post({
		kind: 'tool',
		phase: 'start',
		id: toolId,
		name: toolName,
		verb,
		target,
		argsPreview: skipArgsPreview ? '' : previewJson(args),
		...shellStart,
	});
}

function replayToolFinish(host: IDroxChatAgentEventHost, toolUseId: string, rawContent: string, isError: boolean): void {
	let output: unknown = rawContent ?? '';
	try {
		output = JSON.parse(rawContent) as unknown;
	} catch {
		/* chaîne brute */
	}
	const id = toolUseId || '?';
	const pending = host.takePendingToolForFileFinish(id, output);
	const pendingName = pending?.name;

	if (pendingName === 'delegate_executor') {
		return;
	}

	if (pendingName === 'todo_write' || (!pendingName && isTodoWriteOutput(output))) {
		if (isError) {
			const msg = extractTodoErrorMessage(output) ?? 'validation rejected';
			host.post({ kind: 'append', role: 'error', text: `todo_write: ${msg}` });
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

	const isFileMutationFinish =
		pendingName === 'file_edit' ||
		pendingName === 'file_write' ||
		pendingName === 'notebook_edit';
	host.handleFileMutationAfterToolFinish(pendingName, output, isError, id, pending?.args);
	if (isFileMutationFinish) {
		return;
	}
	const skipOutputPreview =
		(pendingName && SKIP_TOOL_PREVIEW_NAMES.has(pendingName)) ||
		pendingName === 'delegate_executor' ||
		pendingName === 'file_read' ||
		pendingName === 'grep' ||
		pendingName === 'glob' ||
		pendingName === 'lsp' ||
		pendingName === 'workspace_map_read';
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
}

function toolUseFromBlock(c: IDroxTranscriptContentBlock): { id: string; name: string; input: unknown } | undefined {
	if (c.type !== 'tool_use') {
		return undefined;
	}
	const name = typeof c.name === 'string' ? c.name : '?';
	const id = typeof c.id === 'string' && c.id ? c.id : '?';
	return { id, name, input: c.input };
}

/** Rejoue un message transcript avec le même rendu UI que le run live. */
export function replayTranscriptMessageRich(host: IDroxChatAgentEventHost, m: IDroxTranscriptMessage): void {
	const blocks = Array.isArray(m.content) ? m.content : [];

	if (m.role === 'system' || m.role === 'user') {
		const text = textFromBlocks(blocks);
		if (text && (m.role === 'user' || !shouldSkipTranscriptSystem(text))) {
			host.post({ kind: 'append', role: m.role, text });
		}
		return;
	}

	if (m.role === 'assistant') {
		for (const c of blocks) {
			if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
				replayAssistantTextWithPhases(host, c.text);
			} else if (c.type === 'tool_use') {
				const tu = toolUseFromBlock(c);
				if (tu) {
					replayToolStart(host, tu.id, tu.name, tu.input);
				}
			}
		}
		host.post({ kind: 'phase', close: true });
		return;
	}

	if (m.role === 'tool') {
		for (const c of blocks) {
			if (c.type !== 'tool_result') {
				continue;
			}
			const id = typeof c.tool_use_id === 'string' && c.tool_use_id ? c.tool_use_id : '?';
			const raw = typeof c.content === 'string' ? c.content : '';
			replayToolFinish(host, id, raw, Boolean(c.is_error));
		}
	}
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/** Rejoue le journal UI enregistré pendant le run (fidèle au rendu live). */
export async function replayUiJournalMessages(
	delegate: Pick<IDroxChatTabsDelegate, 'post'>,
	messages: readonly DroxHostToWebviewMessage[],
): Promise<void> {
	delegate.post({ kind: 'replayPrepare' });
	for (let i = 0; i < messages.length; i++) {
		delegate.post(messages[i]!);
		if (i > 0 && (i + 1) % 12 === 0) {
			await delay(12);
		}
	}
}

/** L2 — prepend un lot d'événements UI au-dessus du fil actuel. */
export async function replayUiJournalMessagesPrepend(
	delegate: Pick<IDroxChatTabsDelegate, 'post'>,
	messages: readonly DroxHostToWebviewMessage[],
): Promise<void> {
	delegate.post({ kind: 'replayPrepare', prepend: true });
	for (let i = 0; i < messages.length; i++) {
		delegate.post(messages[i]!);
	}
	delegate.post({ kind: 'sessionHistoryPageDone' });
}

/** L2 — prepend transcript (sessions sans ui-replay). */
export async function replayTranscriptMessagesPrepend(
	host: IDroxChatAgentEventHost,
	messages: readonly IDroxTranscriptMessage[],
): Promise<void> {
	host.post({ kind: 'replayPrepare', prepend: true });
	for (let i = 0; i < messages.length; i++) {
		replayTranscriptMessageRich(host, messages[i]!);
	}
	host.post({ kind: 'sessionHistoryPageDone' });
}

/** Rejoue tout le transcript (rich ou compact si volumineux). */
export async function replayTranscriptMessages(
	host: IDroxChatAgentEventHost,
	messages: readonly IDroxTranscriptMessage[],
): Promise<void> {
	host.post({ kind: 'replayPrepare' });
	const voluminous = messages.length > REPLAY_LIGHT_MESSAGE_THRESHOLD;
	if (voluminous) {
		host.post({
			kind: 'append',
			role: 'system',
			text: `[historique] ${messages.length} messages — affichage simplifié (session volumineuse).`,
		});
		for (let i = 0; i < messages.length; i++) {
			for (const line of transcriptMessageToReplayAppends(messages[i])) {
				host.post({ kind: 'append', role: line.role, text: line.text });
			}
			if (i > 0 && (i + 1) % REPLAY_YIELD_EVERY === 0) {
				await delay(REPLAY_YIELD_MS);
			}
		}
		return;
	}

	for (let i = 0; i < messages.length; i++) {
		replayTranscriptMessageRich(host, messages[i]);
		if (i > 0 && (i + 1) % REPLAY_YIELD_EVERY === 0) {
			await delay(REPLAY_YIELD_MS);
		}
	}
	host.post({ kind: 'phase', phase: 'done' });
}
