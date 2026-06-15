/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Registre canonique des `kind` hôte → webview (`DroxHostToWebviewMessage`).
 * Garder synchronisé avec `media/droxChat/bridge/host-message.js`.
 */
export const DROX_HOST_TO_WEBVIEW_MESSAGE_KINDS = [
	'append',
	'appendAttachments',
	'appendReferences',
	'chatReset',
	'clearAssistant',
	'compact',
	'context',
	'delta',
	'dropHighlight',
	'exploreNotice',
	'fileChange',
	'generalSettings',
	'llmModels',
	'loopIntervention',
	'llmTurnPrepared',
	'memory',
	'orchestrationRole',
	'pasteCandidate',
	'pathCompleteResult',
	'permissionMode',
	'phase',
	'prefillPrompt',
	'productVersion',
	'railStationDone',
	'railStationEnter',
	'railStationHold',
	'replayPrepare',
	'sessionHistory',
	'sessionHistoryPageDone',
	'runObjective',
	'runRevert',
	'runRouting',
	'session',
	'sessionReplayDone',
	'sessions',
	'state',
	'tabs',
	'todoUpdate',
	'tool',
	'usage',
	'userAsk',
	'userAskClose',
	'userFacingReply',
	'userPromptSticky',
] as const;

export type DroxHostToWebviewMessageKind = (typeof DROX_HOST_TO_WEBVIEW_MESSAGE_KINDS)[number];

const KIND_SET = new Set<string>(DROX_HOST_TO_WEBVIEW_MESSAGE_KINDS);

export function isDroxHostToWebviewMessageKind(value: string): value is DroxHostToWebviewMessageKind {
	return KIND_SET.has(value);
}
