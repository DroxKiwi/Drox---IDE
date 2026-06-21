/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	D.state.llmProvider = 'ollama';
	D.state.llmServer = '';
	D.state.llmListUrl = '';
	D.state.llmModels = [];
	D.state.selectedLlmModel = '';
	D.state.llmModelsError = '';
	D.state.llmModelsLoading = false;

	fn.renderLlmModelPicker = function() {
		const wrap = D.dom.llmModelPickerWrapEl;
		const select = D.dom.llmModelPickerEl;
		const reloadBtn = D.dom.llmModelReloadBtn;
		if (!wrap || !select) {
			return;
		}
		const models = Array.isArray(D.state.llmModels) ? D.state.llmModels : [];
		const selected = String(D.state.selectedLlmModel || '').trim();
		const err = String(D.state.llmModelsError || '').trim();
		const loading = D.state.llmModelsLoading;

		if (reloadBtn) {
			reloadBtn.disabled = loading || D.state.busy;
		}

		select.innerHTML = '';
		if (loading) {
			const opt = document.createElement('option');
			opt.value = '';
			opt.textContent = 'Chargement…';
			select.appendChild(opt);
			select.disabled = true;
			wrap.hidden = false;
			select.title = D.state.llmListUrl ? `GET ${D.state.llmListUrl}` : 'Chargement…';
			return;
		}

		if (models.length === 0) {
			const opt = document.createElement('option');
			opt.value = '';
			opt.textContent = err ? '— list unavailable —' : '— click ↻ —';
			select.appendChild(opt);
			select.disabled = true;
			wrap.hidden = false;
			const serverHint = D.state.llmServer ? `Server: ${D.state.llmServer}\n` : 'Set drox.server (or DROX_SERVER), then ↻\n';
			const modelHint = selected ? `Selection (drox.architect.model): ${selected}\n` : '';
			select.title = err
				? `${serverHint}${modelHint}${err}${D.state.llmListUrl ? `\nGET ${D.state.llmListUrl}` : ''}`
				: `${serverHint}${modelHint}Click ↻ to load models from the server.`;
			return;
		}

		for (const name of models) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = name;
			if (name === selected) {
				opt.selected = true;
			}
			select.appendChild(opt);
		}
		if (selected && !models.includes(selected)) {
			const extra = document.createElement('option');
			extra.value = selected;
			extra.textContent = selected;
			extra.selected = true;
			select.insertBefore(extra, select.firstChild);
		}
		select.disabled = D.state.busy;
		wrap.hidden = false;
		const hint = D.state.llmListUrl ? `\n${D.state.llmListUrl}` : '';
		select.title = err
			? `${err}${hint}`
			: `${models.length} model(s) — ${D.state.llmServer || 'server'}${hint}`;
	};

	fn.applyLlmModelsFromHost = function(payload) {
		D.state.llmModelsLoading = false;
		D.state.llmProvider = typeof payload.provider === 'string' ? payload.provider : 'ollama';
		D.state.llmServer = typeof payload.server === 'string' ? payload.server : '';
		D.state.llmListUrl = typeof payload.listUrl === 'string' ? payload.listUrl : '';
		D.state.llmModels = Array.isArray(payload.models)
			? payload.models.map((m) => String(m ?? '').trim()).filter((m) => m.length > 0)
			: [];
		D.state.selectedLlmModel = typeof payload.selected === 'string' ? payload.selected.trim() : '';
		D.state.llmModelsError = typeof payload.error === 'string' ? payload.error.trim() : '';
		fn.renderLlmModelPicker();
	};

	fn.setLlmModel = function(model, notifyHost = true) {
		const trimmed = String(model ?? '').trim();
		D.state.selectedLlmModel = trimmed;
		if (D.dom.llmModelPickerEl) {
			D.dom.llmModelPickerEl.value = trimmed;
		}
		if (notifyHost && trimmed) {
			D.vscode.postMessage({ type: 'setModel', model: trimmed });
		}
	};

	fn.refreshLlmModels = function() {
		D.state.llmModelsLoading = true;
		D.state.llmModelsError = '';
		fn.renderLlmModelPicker();
		D.vscode.postMessage({ type: 'refreshLlmModels' });
	};

	fn.initLlmModelPicker = function() {
		if (!D.dom.llmModelPickerEl) {
			return;
		}
		D.dom.llmModelPickerWrapEl.hidden = false;
		D.dom.llmModelPickerEl.addEventListener('change', () => {
			const value = D.dom.llmModelPickerEl.value.trim();
			if (!value || value === D.state.selectedLlmModel) {
				return;
			}
			fn.setLlmModel(value, true);
		});
		if (D.dom.llmModelReloadBtn) {
			D.dom.llmModelReloadBtn.addEventListener('click', () => fn.refreshLlmModels());
		}
	};
})(globalThis.DroxChat);
