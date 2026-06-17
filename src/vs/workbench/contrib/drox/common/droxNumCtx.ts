/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DROX_DEFAULT_NUM_CTX } from './droxProductDefaults.js';

/** Fenêtres `num_ctx` proposées pour l'architecte (doit rester aligné avec `constants-num-ctx.js`). */
export const DROX_NUM_CTX_CHOICES = [
	16_384,
	32_768,
	65_536,
	131_072,
	262_144,
	524_288,
	1_000_000,
] as const;

export type DroxNumCtxChoice = (typeof DROX_NUM_CTX_CHOICES)[number];

export function formatDroxNumCtxLabel(tokens: number): string {
	if (tokens >= 1_000_000) {
		return '1M';
	}
	if (tokens >= 1024) {
		const k = tokens / 1024;
		return Number.isInteger(k) ? `${k}k` : `${Math.round(k)}k`;
	}
	return String(tokens);
}

export function normalizeDroxNumCtx(value: unknown): DroxNumCtxChoice {
	const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DROX_DEFAULT_NUM_CTX;
	for (const choice of DROX_NUM_CTX_CHOICES) {
		if (choice === n) {
			return choice;
		}
	}
	let best: DroxNumCtxChoice = DROX_DEFAULT_NUM_CTX;
	let bestDist = Infinity;
	for (const choice of DROX_NUM_CTX_CHOICES) {
		const dist = Math.abs(choice - n);
		if (dist < bestDist) {
			bestDist = dist;
			best = choice;
		}
	}
	return best;
}
