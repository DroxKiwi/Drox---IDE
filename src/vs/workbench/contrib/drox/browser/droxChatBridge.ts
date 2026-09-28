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

	| { readonly type: 'setModel'; readonly model: string }

	| { readonly type: 'setArchitectModel'; readonly model: string }

	| {
		readonly type: 'setArchitectLlmParams';
		readonly numCtx?: number;
		readonly temperature?: number | null;
		readonly topP?: number | null;
		readonly topK?: number | null;
		readonly repeatPenalty?: number | null;
		readonly minP?: number | null;
		readonly seed?: number | null;
		readonly presencePenalty?: number | null;
		readonly frequencyPenalty?: number | null;
		readonly maxTokens?: number | null;
		readonly keepAlive?: string | null;
		readonly reasoningEffort?: string | null;
		readonly thinkingBudget?: number | null;
		readonly mutedParams?: readonly string[] | null;
	}

	| { readonly type: 'setGeneralSettings'; readonly settings: Record<string, unknown> }

	| { readonly type: 'refreshLlmModels' }

	| { readonly type: 'testLlmConnection'; readonly requestId: string; readonly settings: Record<string, unknown> }

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
	| { readonly type: 'resumeRunAfterError'; readonly messageId: string }
	| { readonly type: 'restartRunAfterError'; readonly messageId: string }
	| { readonly type: 'undoFileChange'; readonly toolId: string }
	| { readonly type: 'redoFileChange'; readonly toolId: string }

	| { readonly type: 'exportTranscript' }

	| { readonly type: 'showReleaseNotes' }

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
		readonly kind: 'railStationEnter';
		readonly station: string;
		readonly label?: string;
		readonly taskId?: string;
	}

	| { readonly kind: 'railStationHold'; readonly station: string }

	| { readonly kind: 'railStationDone'; readonly station: string }

	| {
		readonly kind: 'runRouting';
		readonly architectGate: string;
		readonly startRun: string;
		readonly greetingOnly: boolean;
		readonly expectsWorkspaceMutation: boolean;
		readonly intentSource: string;
	}

	| {
		readonly kind: 'llmTurnPrepared';
		readonly iter: number;
		readonly frameId: string;
		readonly layersApplied: readonly string[];
		readonly railStation?: string;
		readonly toolNames: readonly string[];
		readonly architectSnapshotBytes: number;
		readonly toolProtocolBytes: number;
		readonly railSnapshotBytes: number;
		readonly bootSystemBytes: number;
		readonly messagesCount: number;
	}

	| { readonly kind: 'delta'; readonly text: string; readonly executorJobId?: string }

	| { readonly kind: 'clearAssistant' }

	| { readonly kind: 'session'; readonly id: string; readonly uiStats?: { readonly totalIn: number; readonly totalOut: number; readonly ctx: number } }

	| { readonly kind: 'tabs'; readonly tabs: ReadonlyArray<{ readonly id: string; readonly title: string }>; readonly activeId: string | null }

	| { readonly kind: 'context'; readonly tokensUsed: number }

	| { readonly kind: 'phase'; readonly phase?: string; readonly close?: boolean; readonly executorJobId?: string }

	| {
		readonly kind: 'tool';
		readonly phase: 'start' | 'finish' | 'progress';
		readonly id: string;
		readonly name?: string;
		readonly verb?: string;
		readonly target?: string;
		readonly mutationPath?: string;
		readonly argsPreview?: string;
		readonly isError?: boolean;
		readonly outputPreview?: string;
		readonly elapsedMs?: number;
		readonly executorJobId?: string;
		readonly shellKind?: 'cmd' | 'powershell' | 'bash';
		readonly shellCommand?: string;
		readonly shellDescription?: string;
		readonly shellOutput?: {
			readonly stdout?: string;
			readonly stderr?: string;
			readonly exit_code?: number | null;
			readonly timed_out?: boolean;
			readonly duration_ms?: number;
			readonly error?: string;
		};
	}

	| DroxFileChangeHostMessage

	| { readonly kind: 'fileChangeState'; readonly toolId: string; readonly undoState: 'applied' | 'reverted' }
	| { readonly kind: 'fileChangeUndoReady'; readonly toolId: string }

	| { readonly kind: 'usage'; readonly inputTokens: number; readonly outputTokens: number }

	| { readonly kind: 'chatReset' }

	| { readonly kind: 'sessionReplayDone'; readonly scrollToEnd?: boolean }

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

	| { readonly kind: 'runRevert'; readonly canRevert: boolean; readonly fileCount: number }

	| { readonly kind: 'runRecoveryOffer'; readonly messageId: string }

	| { readonly kind: 'runRecoveryDismiss' }

	| { readonly kind: 'runRecoveryClearAfter'; readonly messageId: string }

	| {
		readonly kind: 'llmModels';
		readonly provider: string;
		readonly server: string;
		readonly models: readonly string[];
		readonly selected: string;
		readonly error?: string;
		readonly listUrl?: string;
		readonly architectModel?: string;
		readonly architectNumCtx?: number;
		readonly architectTemperature?: number;
		readonly architectTopP?: number;
		readonly architectTopK?: number;
		readonly architectRepeatPenalty?: number;
		readonly architectMinP?: number;
		readonly architectSeed?: number;
		readonly architectPresencePenalty?: number;
		readonly architectFrequencyPenalty?: number;
		readonly architectMaxTokens?: number;
		readonly architectKeepAlive?: string;
		readonly architectReasoningEffort?: string;
		readonly architectThinkingBudget?: number;
		readonly architectLlmParamsMuted?: readonly string[];
	}

	| { readonly kind: 'generalSettings'; readonly settings: Record<string, unknown> }

	| {
		readonly kind: 'connectionTestResult';
		readonly requestId: string;
		readonly ok: boolean;
		readonly error?: string;
		readonly modelCount?: number;
		readonly listUrl?: string;
	}

	| DroxUserAskHostMessage;



export function isDroxWebviewToHostMessage(msg: unknown): msg is DroxWebviewToHostMessage {

	if (!msg || typeof msg !== 'object') {

		return false;

	}

	const t = (msg as { type?: unknown }).type;

	if (t === 'webviewReady' || t === 'cancelRun' || t === 'revertLastRun' || t === 'exportTranscript' || t === 'showReleaseNotes' || t === 'listSessions' || t === 'resetWorkspace' || t === 'newChat' || t === 'openSettings' || t === 'pickReferences' || t === 'composerDrop' || t === 'refreshLlmModels' || t === 'setGeneralSettings') {

		return true;

	}

	if (t === 'testLlmConnection') {
		const m = msg as { requestId?: unknown; settings?: unknown };
		return typeof m.requestId === 'string' && m.settings !== undefined && typeof m.settings === 'object';
	}

	if (t === 'revertToMessage') {
		return typeof (msg as { messageId?: unknown }).messageId === 'string';
	}

	if (t === 'resumeRunAfterError' || t === 'restartRunAfterError') {
		return typeof (msg as { messageId?: unknown }).messageId === 'string';
	}

	if (t === 'undoFileChange' || t === 'redoFileChange') {
		return typeof (msg as { toolId?: unknown }).toolId === 'string';
	}

	if (t === 'setPermissionMode') {
		return typeof (msg as { permissionMode?: unknown }).permissionMode === 'string';
	}

	if (t === 'setModel' || t === 'setArchitectModel') {
		return typeof (msg as { model?: unknown }).model === 'string';
	}

	if (t === 'setArchitectLlmParams') {
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


