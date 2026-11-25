/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Reserve scrollable sous le transcript (effet type Cursor). */
export const DROX_NATIVE_CHAT_TRANSCRIPT_TAIL_PADDING_RATIO = 0.48;

/**
 * Accroches stables pour les tests Playwright du chat natif IDE.
 * Preferer ces ids plutot que les classes Monaco generees.
 */
export const DROX_NATIVE_CHAT_TEST_IDS = {
	idePanelRoot: 'drox-ide-native-chat',
	discussionShell: 'drox-discussion-shell',
	nativeChatWidget: 'drox-ide-native-chat-widget',
} as const;

/** Selecteurs CSS derives (documentes pour Playwright page.locator). */
export const DROX_NATIVE_CHAT_PLAYWRIGHT = {
	idePanel: `[data-testid="${DROX_NATIVE_CHAT_TEST_IDS.idePanelRoot}"]`,
	discussionShell: `[data-testid="${DROX_NATIVE_CHAT_TEST_IDS.discussionShell}"]`,
	transcriptList: `${'[data-testid="' + DROX_NATIVE_CHAT_TEST_IDS.discussionShell + '"]'} .interactive-list`,
	composer: `${'[data-testid="' + DROX_NATIVE_CHAT_TEST_IDS.discussionShell + '"]'} .interactive-input-part`,
	runWarmup: '.activity-warmup.drox-run-warmup',
	responseLoadingGrid: '.drox-response-loading-grid',
} as const;