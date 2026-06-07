/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxTranscriptMessage } from './droxSession.js';

/** Début d'un tour utilisateur dans le journal UI (`append` user). */
export function isUiReplayUserTurnBoundary(message: { readonly kind: string; readonly role?: string }): boolean {
	return message.kind === 'append' && message.role === 'user';
}

export function collectUiReplayTurnStartIndices(
	messages: readonly { kind: string; role?: string }[],
): number[] {
	const turnStarts: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		if (isUiReplayUserTurnBoundary(messages[i]!)) {
			turnStarts.push(i);
		}
	}
	return turnStarts;
}

/**
 * Garde les N derniers tours du journal UI (depuis le dernier `append` user de chaque tour).
 */
export function sliceUiReplayTailTurns<T extends { kind: string; role?: string }>(
	messages: readonly T[],
	maxTurns: number,
): { readonly slice: T[]; readonly hasOlder: boolean; readonly oldestLoadedIndex: number } {
	const safeTurns = Math.max(1, maxTurns);
	if (messages.length === 0) {
		return { slice: [], hasOlder: false, oldestLoadedIndex: 0 };
	}
	const turnStarts = collectUiReplayTurnStartIndices(messages);
	if (turnStarts.length === 0) {
		return { slice: [...messages], hasOlder: false, oldestLoadedIndex: 0 };
	}
	const start = turnStarts[Math.max(0, turnStarts.length - safeTurns)]!;
	return {
		slice: messages.slice(start),
		hasOlder: start > 0,
		oldestLoadedIndex: start,
	};
}

/** Tours immédiatement avant `beforeIndex` (exclus) — pagination scroll-back L2. */
export function sliceUiReplayBeforeTurns<T extends { kind: string; role?: string }>(
	messages: readonly T[],
	beforeIndex: number,
	maxTurns: number,
): { readonly slice: T[]; readonly hasOlder: boolean; readonly oldestLoadedIndex: number } {
	const safeBefore = Math.max(0, Math.min(beforeIndex, messages.length));
	const safeTurns = Math.max(1, maxTurns);
	if (safeBefore === 0) {
		return { slice: [], hasOlder: false, oldestLoadedIndex: 0 };
	}
	const turnStarts = collectUiReplayTurnStartIndices(messages);
	const startsBefore = turnStarts.filter(s => s < safeBefore);
	if (startsBefore.length === 0) {
		return {
			slice: messages.slice(0, safeBefore),
			hasOlder: false,
			oldestLoadedIndex: 0,
		};
	}
	const startTurnIdx = Math.max(0, startsBefore.length - safeTurns);
	const startIndex = startsBefore[startTurnIdx]!;
	return {
		slice: messages.slice(startIndex, safeBefore),
		hasOlder: startIndex > 0 || startTurnIdx > 0,
		oldestLoadedIndex: startIndex,
	};
}

/** Derniers tours du transcript moteur (messages `role: user`). */
export function sliceTranscriptTailTurns(
	messages: readonly IDroxTranscriptMessage[],
	maxTurns: number,
): { readonly messages: IDroxTranscriptMessage[]; readonly hasOlder: boolean; readonly oldestLoadedIndex: number } {
	const safeTurns = Math.max(1, maxTurns);
	if (messages.length === 0) {
		return { messages: [], hasOlder: false, oldestLoadedIndex: 0 };
	}
	const userStarts: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		if (messages[i]!.role === 'user') {
			userStarts.push(i);
		}
	}
	if (userStarts.length === 0) {
		return { messages: [...messages], hasOlder: false, oldestLoadedIndex: 0 };
	}
	const start = userStarts[Math.max(0, userStarts.length - safeTurns)]!;
	return {
		messages: messages.slice(start),
		hasOlder: start > 0,
		oldestLoadedIndex: start,
	};
}

export function sliceTranscriptBeforeTurns(
	messages: readonly IDroxTranscriptMessage[],
	beforeIndex: number,
	maxTurns: number,
): { readonly messages: IDroxTranscriptMessage[]; readonly hasOlder: boolean; readonly oldestLoadedIndex: number } {
	const safeBefore = Math.max(0, Math.min(beforeIndex, messages.length));
	const safeTurns = Math.max(1, maxTurns);
	if (safeBefore === 0) {
		return { messages: [], hasOlder: false, oldestLoadedIndex: 0 };
	}
	const userStarts: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		if (messages[i]!.role === 'user') {
			userStarts.push(i);
		}
	}
	const startsBefore = userStarts.filter(s => s < safeBefore);
	if (startsBefore.length === 0) {
		return {
			messages: messages.slice(0, safeBefore),
			hasOlder: false,
			oldestLoadedIndex: 0,
		};
	}
	const startTurnIdx = Math.max(0, startsBefore.length - safeTurns);
	const startIndex = startsBefore[startTurnIdx]!;
	return {
		messages: messages.slice(startIndex, safeBefore),
		hasOlder: startIndex > 0 || startTurnIdx > 0,
		oldestLoadedIndex: startIndex,
	};
}
