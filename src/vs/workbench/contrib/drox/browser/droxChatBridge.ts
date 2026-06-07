/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxAttachmentPayload } from '../common/droxAttachments.js';
import { IDroxReferencePayload } from '../common/droxReferences.js';
import { IDroxPasteAttachmentPayload, IDroxPasteCandidateWire, IDroxUserMessagePasteWire } from '../common/droxPasteCandidates.js';
import { IDroxUserMessageReferenceWire } from '../common/droxReferences.js';

import { DroxUserAskHostMessage, IDroxUserAskAnswerMessage } from '../common/droxUserAsk.js';
import { DroxFileChangeHostMessage } from '../common/droxFileChange.js';
import { IDroxPathCompletionItem } from '../common/droxPromptCompletion.js';

/** Messages webview → hôte. */

export type DroxWebviewToHostMessage =

	| { readonly type: 'webviewReady' }

	| { readonly type: 'send'; readonly prompt: string; readonly mode: string; readonly attachments?: IDroxAttachmentPayload[]; readonly references?: readonly IDroxReferencePayload[]; readonly pastes?: readonly IDroxPasteAttachmentPayload[] }

	| { readonly type: 'setPermissionMode'; readonly permissionMode: string }

	| { readonly type: 'setArchitectInteractionMode'; readonly architectInteractionMode: string }

	| { readonly type: 'setModel'; readonly model: string }

	| { readonly type: 'setArchitectModel'; readonly model: string }

	| { readonly type: 'setExecutorModel'; readonly model: string }

	| {
		readonly type: 'setArchitectLlmParams';
		readonly numCtx?: number;
		readonly topP?: number;
		readonly topK?: number;
		readonly repeatPenalty?: number;
		readonly minP?: number;
		readonly seed?: number;
		readonly temperature?: number;
	}

	| {
		readonly type: 'setExecutorLlmParams';
		readonly numCtx?: number;
		readonly topP?: number;
		readonly topK?: number;
		readonly repeatPenalty?: number;
		readonly minP?: number;
		readonly seed?: number;
		readonly temperature?: number;
	}

	| { readonly type: 'setOrchestrationMaxParallelExecutors'; readonly value?: number }

	| { readonly type: 'setGeneralSettings'; readonly settings: Record<string, unknown> }

	| { readonly type: 'refreshLlmModels' }

	| { readonly type: 'cancelRun' }

	| { readonly type: 'slash'; readonly command?: string; readonly args?: string; readonly slashInvalid?: string }

	| { readonly type: 'listSessions' }

	| { readonly type: 'resetWorkspace' }

	| { readonly type: 'loadSession'; readonly sessionId: string }

	| { readonly type: 'loadSessionOlder'; readonly sessionId: string; readonly beforeIndex: number }

	| { readonly type: 'switchTab'; readonly sessionId: string }

	| { readonly type: 'closeTab'; readonly sessionId: string }

	| { readonly type: 'newChat' }

	| { readonly type: 'openFile'; readonly filePath: string }

	| { readonly type: 'openSettings' }

	| { readonly type: 'pickReferences' }

	| { readonly type: 'openPasteSource'; readonly kind?: string; readonly absPath?: string; readonly relPath?: string | null; readonly startLine?: number; readonly endLine?: number }

	| { readonly type: 'pathComplete'; readonly requestId: string; readonly query: string }

	| { readonly type: 'composerDrop' }

	| { readonly type: 'revertLastRun' }
	| { readonly type: 'revertToMessage'; readonly messageId: string }

	| { readonly type: 'exportTranscript' }

	| IDroxUserAskAnswerMessage;



/** Messages hôte → webview. */

export type DroxHostToWebviewMessage =

	| { readonly kind: 'state'; readonly busy: boolean }

	| { readonly kind: 'productVersion'; readonly label: string; readonly title: string }

	| {
		readonly kind: 'append';
		readonly role: 'user' | 'assistant' | 'error' | 'system';
		readonly text: string;
		readonly messageId?: string;
		/** Liens fichier/dossier inline dans le fil (hors images). */
		readonly references?: readonly IDroxUserMessageReferenceWire[];
		readonly pastes?: readonly IDroxUserMessagePasteWire[];
		/** Aperçus images (data URL) — affichés à part des liens fichier. */
		readonly images?: readonly { readonly relPath: string; readonly dataUrl: string }[];
	}

	| { readonly kind: 'userPromptSticky'; readonly text: string; readonly meta?: string; readonly fullText: string }

	| { readonly kind: 'runObjective'; readonly text: string }

	| { readonly kind: 'loopIntervention'; readonly level: string; readonly userMessage: string; readonly kindDetail?: string; readonly turns?: number }

	| { readonly kind: 'exploreNotice'; readonly text: string }

	| { readonly kind: 'orchestrationRole'; readonly role: string; readonly executorJobId?: string }

	| { readonly kind: 'userFacingReply'; readonly text: string }

	| {
		readonly kind: 'subagentStart';
		readonly subagentType: string;
		readonly description: string;
		readonly jobId?: string;
		readonly background?: boolean;
	}

	| {
		readonly kind: 'subagentDone';
		readonly subagentType: string;
		readonly summary: string;
		readonly truncated?: boolean;
		readonly iterationsUsed?: number;
		readonly jobId?: string;
		readonly success?: boolean;
		readonly taskStatus?: string;
		readonly errorMessage?: string;
	}

	| { readonly kind: 'delta'; readonly text: string; readonly executorJobId?: string }

	| { readonly kind: 'clearAssistant' }

	| { readonly kind: 'session'; readonly id: string; readonly uiStats?: { readonly totalIn: number; readonly totalOut: number; readonly ctx: number } }

	| { readonly kind: 'tabs'; readonly tabs: ReadonlyArray<{ readonly id: string; readonly title: string }>; readonly activeId: string | null }

	| { readonly kind: 'context'; readonly tokensUsed: number }

	| { readonly kind: 'phase'; readonly phase?: string; readonly close?: boolean; readonly executorJobId?: string }

	| {
		readonly kind: 'tool';
		readonly phase: 'start' | 'finish';
		readonly id: string;
		readonly name?: string;
		readonly verb?: string;
		readonly target?: string;
		readonly argsPreview?: string;
		readonly isError?: boolean;
		readonly outputPreview?: string;
		readonly toolOutput?: unknown;
		readonly taskBackground?: boolean;
		readonly executorJobId?: string;
	}

	| DroxFileChangeHostMessage

	| { readonly kind: 'usage'; readonly inputTokens: number; readonly outputTokens: number }

	| { readonly kind: 'chatReset' }

	| { readonly kind: 'sessionReplayDone' }

	| { readonly kind: 'replayPrepare'; readonly prepend?: boolean }

	| { readonly kind: 'sessionHistory'; readonly hasOlder: boolean; readonly oldestLoadedIndex: number }

	| { readonly kind: 'sessionHistoryPageDone' }

	| { readonly kind: 'sessions'; readonly items: ReadonlyArray<{ id: string; modifiedSecs: number; sizeBytes: number; title?: string }>; readonly currentId: string | null; readonly error?: string }

	| { readonly kind: 'compact'; readonly active: boolean }

	| { readonly kind: 'memory'; readonly slug: string; readonly path: string; readonly objective: string }

	| { readonly kind: 'appendReferences'; readonly uris: readonly string[] }

	| { readonly kind: 'appendAttachments'; readonly attachments: readonly IDroxAttachmentPayload[] }

	| { readonly kind: 'dropHighlight'; readonly active: boolean }

	| { readonly kind: 'pasteCandidate'; readonly candidate: IDroxPasteCandidateWire }

	| { readonly kind: 'pathCompleteResult'; readonly requestId: string; readonly items: readonly IDroxPathCompletionItem[]; readonly error?: string }

	| { readonly kind: 'prefillPrompt'; readonly text: string; readonly replace?: boolean }

	| { readonly kind: 'todoUpdate'; readonly todos: ReadonlyArray<{ readonly id: string; readonly content: string; readonly status: string }> }

	| { readonly kind: 'permissionMode'; readonly mode: string }

	| { readonly kind: 'architectInteractionMode'; readonly mode: string }

	| { readonly kind: 'runRevert'; readonly canRevert: boolean; readonly fileCount: number }

	| {
		readonly kind: 'llmModels';
		readonly provider: string;
		readonly server: string;
		readonly models: readonly string[];
		readonly selected: string;
		readonly error?: string;
		readonly listUrl?: string;
		readonly architectModel?: string;
		readonly executorModel?: string;
		readonly architectNumCtx?: number;
		readonly executorNumCtx?: number;
		readonly architectTopP?: number;
		readonly architectTopK?: number;
		readonly architectRepeatPenalty?: number;
		readonly architectMinP?: number;
		readonly architectSeed?: number;
		readonly architectTemperature?: number;
		readonly orchestrationMaxParallelExecutors?: number;
	}

	| { readonly kind: 'generalSettings'; readonly settings: Record<string, unknown> }

	| DroxUserAskHostMessage;



export function isDroxWebviewToHostMessage(msg: unknown): msg is DroxWebviewToHostMessage {

	if (!msg || typeof msg !== 'object') {

		return false;

	}

	const t = (msg as { type?: unknown }).type;

	if (t === 'webviewReady' || t === 'cancelRun' || t === 'revertLastRun' || t === 'exportTranscript' || t === 'listSessions' || t === 'resetWorkspace' || t === 'newChat' || t === 'openSettings' || t === 'pickReferences' || t === 'composerDrop' || t === 'refreshLlmModels' || t === 'setGeneralSettings') {

		return true;

	}

	if (t === 'revertToMessage') {
		return typeof (msg as { messageId?: unknown }).messageId === 'string';
	}

	if (t === 'setPermissionMode') {
		return typeof (msg as { permissionMode?: unknown }).permissionMode === 'string';
	}

	if (t === 'setArchitectInteractionMode') {
		return typeof (msg as { architectInteractionMode?: unknown }).architectInteractionMode === 'string';
	}

	if (t === 'setModel' || t === 'setArchitectModel' || t === 'setExecutorModel') {
		return typeof (msg as { model?: unknown }).model === 'string';
	}

	if (t === 'setArchitectLlmParams' || t === 'setExecutorLlmParams') {
		return true;
	}

	if (t === 'setOrchestrationMaxParallelExecutors') {
		return true;
	}

	if (t === 'loadSession' || t === 'switchTab' || t === 'closeTab') {

		return typeof (msg as { sessionId?: unknown }).sessionId === 'string';

	}

	if (t === 'loadSessionOlder') {
		const m = msg as { sessionId?: unknown; beforeIndex?: unknown };
		return typeof m.sessionId === 'string' && typeof m.beforeIndex === 'number' && Number.isFinite(m.beforeIndex);
	}

	if (t === 'openFile') {

		return typeof (msg as { filePath?: unknown }).filePath === 'string';

	}

	if (t === 'openPasteSource') {
		return true;
	}

	if (t === 'pathComplete') {
		const m = msg as { requestId?: unknown; query?: unknown };
		return typeof m.requestId === 'string' && typeof m.query === 'string';
	}

	if (t === 'send') {

		const m = msg as { prompt?: unknown; mode?: unknown; attachments?: unknown; references?: unknown; pastes?: unknown };

		if (typeof m.prompt !== 'string' || typeof m.mode !== 'string') {

			return false;

		}

		if (m.attachments !== undefined && !Array.isArray(m.attachments)) {

			return false;

		}

		if (m.references !== undefined) {
			if (!Array.isArray(m.references)) {
				return false;
			}
			for (const r of m.references) {
				if (!r || typeof r !== 'object' || typeof (r as { uri?: unknown }).uri !== 'string') {
					return false;
				}
			}
		}

		if (m.pastes !== undefined && !Array.isArray(m.pastes)) {
			return false;
		}

		return true;

	}

	if (t === 'userAskAnswer') {

		const m = msg as { askId?: unknown; answers?: unknown };

		return typeof m.askId === 'string' && Array.isArray(m.answers);

	}

	if (t === 'slash') {

		const m = msg as { slashInvalid?: unknown; command?: unknown; args?: unknown };

		if (typeof m.slashInvalid === 'string') {

			return true;

		}

		return typeof m.command === 'string';

	}

	return false;

}


