/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file
// Keep in sync with `droxNumCtx.ts`.

(function (D) {
	D.const.ARCHITECT_NUM_CTX_CHOICES = [16384, 32768, 65536, 131072, 262144, 524288, 1000000];
	D.const.ARCHITECT_NUM_CTX_DEFAULT = 32768;

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

	D.fn.normalizeArchitectNumCtx = function (raw) {
		const fallback = D.const.ARCHITECT_NUM_CTX_DEFAULT;
		const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : fallback;
		const choices = D.const.ARCHITECT_NUM_CTX_CHOICES;
		if (choices.includes(n)) {
			return n;
		}
		let best = fallback;
		let bestDist = Infinity;
		for (const choice of choices) {
			const dist = Math.abs(choice - n);
			if (dist < bestDist) {
				bestDist = dist;
				best = choice;
			}
		}
		return best;
	};
})(globalThis.DroxChat);
