/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import type { IChatWidgetViewOptions } from '../../../chat/browser/chat.js';

export type DroxChatWidgetViewOptionsSlice = Pick<
	IChatWidgetViewOptions,
	'droxNativeComposer' | 'droxTranscriptTailPaddingRatio' | 'renderInputOnTop'
>;

/** Padding bas du transcript quand le shell Drox est actif (via ChatListWidget). */
export function getDroxChatListPaddingBottom(
	viewOptions: DroxChatWidgetViewOptionsSlice,
	listRenderHeight: number,
	basePadding: number,
): number {
	const ratio = viewOptions.droxTranscriptTailPaddingRatio;
	if (!viewOptions.droxNativeComposer || !ratio || ratio <= 0 || listRenderHeight <= 0) {
		return basePadding;
	}
	return basePadding + Math.round(listRenderHeight * ratio);
}

/** Le bandeau VS Code au-dessus du compositeur reste desactive pour le chat natif Drox. */
export function resolveDroxStickyProgressEnabled(
	viewOptions: DroxChatWidgetViewOptionsSlice,
	renderStyle: 'compact' | 'minimal' | undefined,
): boolean {
	if (viewOptions.droxNativeComposer) {
		return false;
	}
	return !viewOptions.renderInputOnTop && renderStyle !== 'minimal';
}