/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ChatModeKind } from '../../../chat/common/constants.js';
import { IChatWidgetViewOptions } from '../../../chat/browser/chat.js';
import { DroxViews } from '../../common/drox.js';

/**
 * Shared ChatWidget view options for the Drox discussion shell (IDE panel + Agents ChatView).
 * Intentionally mirrors Agents `ChatView` so the composer/tools chrome matches.
 */
export function createDroxDiscussionChatWidgetOptions(kind: 'ide' | 'agents'): IChatWidgetViewOptions {
	const base: IChatWidgetViewOptions = {
		autoScroll: mode => mode !== ChatModeKind.Ask,
		renderFollowups: true,
		supportsFileReferences: true,
		rendererOptions: {
			referencesExpandedWhenEmptyResponse: false,
			progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
		},
		enableImplicitContext: true,
		supportsChangingModes: false,
		/** Mounts Drox toolbar / status / permission chips (Server, Model settings, …). */
		droxNativeComposer: true,
		inputEditorMinLines: 2,
	};

	if (kind === 'ide') {
		// IDE workbench: do NOT set isSessionsWindow — that flag assumes sessions.desktop
		// services and contributed to broken empty composers when the model failed to load.
		return {
			...base,
			enableWorkingSet: 'explicit',
			rendererOptions: {
				...base.rendererOptions,
				renderTextEditsAsSummary: () => true,
			},
		};
	}

	return {
		...base,
		enableWorkingSet: 'implicit',
		/** Agents window ChatView layout padding / sessions chrome. */
		isSessionsWindow: true,
	};
}

export function droxIdeNativeChatViewContext(): { viewId: string } {
	return { viewId: DroxViews.NativeChatViewId };
}

/** Agents-style placeholders for the shared discussion composer. */
export const DROX_DISCUSSION_PLACEHOLDERS: readonly string[] = [
	'What\'s the goal?',
	'What are you building?',
	'What will you ship today?',
	'Describe what you want to build',
	'What problem are you solving?',
];

let lastPlaceholderIndex = -1;

export function pickDroxDiscussionPlaceholder(): string {
	let index = Math.floor(Math.random() * DROX_DISCUSSION_PLACEHOLDERS.length);
	if (index === lastPlaceholderIndex) {
		index = (index + 1) % DROX_DISCUSSION_PLACEHOLDERS.length;
	}
	lastPlaceholderIndex = index;
	return DROX_DISCUSSION_PLACEHOLDERS[index];
}
