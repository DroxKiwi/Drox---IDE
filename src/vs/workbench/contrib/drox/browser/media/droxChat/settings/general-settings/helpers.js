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

	fn.syncEngineTuningPanelVisibility = function() {
		const panel = document.getElementById('general-settings-engine-tuning');
		const strictness = document.getElementById('general-settings-engine-strictness');
		if (!panel || !strictness) {
			return;
		}
		const custom = String(strictness.value || 'normal') === 'custom';
		panel.hidden = !custom;
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
		if (s.maxIterations) {
			parts.push(`×${s.maxIterations}`);
		}
		if (s.engineStrictness && s.engineStrictness !== 'normal') {
			parts.push(s.engineStrictness);
		}
		hint.textContent = parts.length ? parts.join(' · ') : '—';
	}
})(globalThis.DroxChat);
