/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { clampDroxNumCtx, formatDroxContextUsageStat } from './droxNumCtx.js';
import { DROX_DEFAULT_NUM_CTX } from './droxProductDefaults.js';

export interface IDroxChatUiStatsSnapshot {
	readonly totalIn: number;
	readonly totalOut: number;
	readonly ctx: number;
	/** 1.6.0 G-1 — source du compteur ctx affiché. */
	readonly ctxSource: 'estimate' | 'provider' | 'unknown';
}

export function formatDroxCycleElapsed(ms: number): string {
	const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatDroxContextUsageStatFromConfig(
	usedTokens: number,
	numCtx: unknown,
	ctxSource: IDroxChatUiStatsSnapshot['ctxSource'] = 'unknown',
): string {
	const max = clampDroxNumCtx(
		typeof numCtx === 'number' && Number.isFinite(numCtx) ? numCtx : DROX_DEFAULT_NUM_CTX,
	);
	const base = formatDroxContextUsageStat(usedTokens, max);
	if (ctxSource === 'estimate') {
		return `${base} estim.`;
	}
	if (ctxSource === 'provider') {
		return `${base} provider`;
	}
	return base;
}
