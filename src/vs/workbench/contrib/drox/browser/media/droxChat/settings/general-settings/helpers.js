/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.readOptionalNumber = function(raw) {
		const s = String(raw ?? '').trim();
		if (!s) {
			return undefined;
		}
		const n = Number(s);
		return Number.isFinite(n) ? n : undefined;
	}

	fn.syncGeneralSettingsVignetteHint = function() {
		const hint = document.getElementById('general-settings-vignette-hint');
		if (!hint) {
			return;
		}
		const s = D.state.generalSettings || {};
		const parts = [];
		if (s.server) {
			parts.push(String(s.server).replace(/^https?:\/\//, '').slice(0, 18));
		}
		if (s.maxIterations && document.getElementById('general-settings-max-iterations')) {
			parts.push(`×${s.maxIterations}`);
		}
		hint.textContent = parts.length ? parts.join(' · ') : '—';
	}
})(globalThis.DroxChat);
