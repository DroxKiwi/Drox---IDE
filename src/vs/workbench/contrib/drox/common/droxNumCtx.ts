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

export const DROX_NUM_CTX_MIN = 2048;
export const DROX_NUM_CTX_MAX = 1_000_000;

/** Valeur du `<select>` pour la saisie libre (aligné webview). */
export const DROX_NUM_CTX_CUSTOM_SELECT = '__custom__';

export function isDroxNumCtxPreset(value: number): boolean {
	return (DROX_NUM_CTX_CHOICES as readonly number[]).includes(value);
}

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

/** Affichage barre de stats : `14k / 32k (43%)`. */
export function formatDroxContextUsageStat(usedTokens: number, maxCtx: number): string {
	const used = Math.max(0, Math.floor(Number.isFinite(usedTokens) ? usedTokens : 0));
	const max = clampDroxNumCtx(maxCtx);
	if (max <= 0) {
		return formatDroxNumCtxLabel(used) || '0';
	}
	const pct = Math.round((used / max) * 100);
	return `${formatDroxNumCtxLabel(used)} / ${formatDroxNumCtxLabel(max)} (${pct}%)`;
}

export function clampDroxNumCtx(value: unknown): number {
	const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DROX_DEFAULT_NUM_CTX;
	return Math.min(DROX_NUM_CTX_MAX, Math.max(DROX_NUM_CTX_MIN, n));
}

/** @deprecated Préférer {@link clampDroxNumCtx} — conserve le snap preset pour migrations. */
export function normalizeDroxNumCtx(value: unknown): DroxNumCtxChoice {
	const n = clampDroxNumCtx(value);
	if (isDroxNumCtxPreset(n)) {
		return n as DroxNumCtxChoice;
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
