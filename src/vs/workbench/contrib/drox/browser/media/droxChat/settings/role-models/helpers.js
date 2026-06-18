/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	function shortModelLabel(name) {
		const s = String(name || '').trim();
		if (!s) {
			return '—';
		}
		return s.length > 22 ? `${s.slice(0, 20)}…` : s;
	}

	fn.syncRoleModelVignetteHints = function() {
		const archHint = document.getElementById('architect-vignette-model-hint');
		if (archHint) {
			const model = shortModelLabel(D.state.architectModel);
			const ctx = D.state.architectNumCtx;
			let ctxLabel = '';
			if (ctx !== '' && ctx !== undefined) {
				const n = D.fn.clampArchitectNumCtx(ctx);
				ctxLabel = D.fn.isArchitectNumCtxPreset(n)
					? D.fn.formatNumCtxLabel(n)
					: String(n);
			}
			archHint.textContent = ctxLabel ? `${model} · ${ctxLabel}` : model;
		}
	};

	fn.fillRoleModelPanelSelect = function() {
		const select = D.dom.roleModelPanelSelectEl;
		if (!select) {
			return;
		}
		const models = Array.isArray(D.state.llmModels) ? D.state.llmModels : [];
		const current = String(D.state.architectModel || '').trim();
		select.innerHTML = '';
		for (const name of models) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = name;
			if (name === current) {
				opt.selected = true;
			}
			select.appendChild(opt);
		}
		if (current && !models.includes(current)) {
			const extra = document.createElement('option');
			extra.value = current;
			extra.textContent = current;
			extra.selected = true;
			select.insertBefore(extra, select.firstChild);
		}
		select.disabled = D.state.llmModelsLoading || D.state.busy;
	};
})(globalThis.DroxChat);
