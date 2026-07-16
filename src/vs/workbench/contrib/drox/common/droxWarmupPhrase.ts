/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DROX_THINKING_PHRASES } from './droxThinkingPhrases.js';

let lastWarmupPhraseIdx = -1;

export function pickDroxWarmupPhrase(phrases: readonly string[] = DROX_THINKING_PHRASES): string {
	if (!phrases.length) {
		return 'Working…';
	}
	if (phrases.length === 1) {
		return phrases[0];
	}
	let idx = Math.floor(Math.random() * phrases.length);
	if (idx === lastWarmupPhraseIdx) {
		idx = (idx + 1) % phrases.length;
	}
	lastWarmupPhraseIdx = idx;
	return phrases[idx];
}

/** Test-only reset for deterministic phrase selection. */
export function resetDroxWarmupPhraseIndexForTest(): void {
	lastWarmupPhraseIdx = -1;
}
