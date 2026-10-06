/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file
// Keep in sync with `droxNumCtx.ts`.

(function (D) {
	D.const.ARCHITECT_NUM_CTX_CHOICES = [16384, 32768, 65536, 131072, 262144, 524288, 1000000];
	D.const.ARCHITECT_NUM_CTX_DEFAULT = 32768;
	D.const.ARCHITECT_NUM_CTX_MIN = 2048;
	D.const.ARCHITECT_NUM_CTX_MAX = 1000000;
	D.const.ARCHITECT_NUM_CTX_CUSTOM = '__custom__';
	/** Aligné sur `DROX_DEFAULT_MAX_ITERATIONS` / `DROX_MAX_ITERATIONS_CAP` (product defaults). */
	D.const.DEFAULT_MAX_ITERATIONS = 50;
	D.const.MAX_ITERATIONS_CAP = 1000;
	D.const.DEFAULT_SUBAGENTS_MAX_ITERATIONS = 25;

	D.fn.isArchitectNumCtxPreset = function (value) {
		const n = Math.floor(Number(value));
		return Number.isFinite(n) && D.const.ARCHITECT_NUM_CTX_CHOICES.includes(n);
	};

	D.fn.formatNumCtxLabel = function (tokens) {
		const n = Number(tokens);
		if (!Number.isFinite(n)) {
			return '';
		}
		if (n >= 1000000) {
			return '1M';
		}
		if (n >= 1024) {
			const k = n / 1024;
			return Number.isInteger(k) ? `${k}k` : `${Math.round(k)}k`;
		}
		return String(n);
	};

	D.fn.clampArchitectNumCtx = function (raw) {
		const fallback = D.const.ARCHITECT_NUM_CTX_DEFAULT;
		const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : fallback;
		return Math.min(D.const.ARCHITECT_NUM_CTX_MAX, Math.max(D.const.ARCHITECT_NUM_CTX_MIN, n));
	};
})(globalThis.DroxChat);
