/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	const PROMPT_MIN_LINES = 2;
	const PROMPT_MAX_LINES = 12;

	fn.syncPromptInputHeight = function () {
		const el = D.dom.promptEl;
		if (!el) {
			return;
		}
		const style = getComputedStyle(el);
		const lineHeight = Number.parseFloat(style.lineHeight) || 20;
		const padY =
			(Number.parseFloat(style.paddingTop) || 0) +
			(Number.parseFloat(style.paddingBottom) || 0);
		const minH = lineHeight * PROMPT_MIN_LINES + padY;
		const maxH = lineHeight * PROMPT_MAX_LINES + padY;
		el.style.height = 'auto';
		const contentH = el.scrollHeight;
		const next = Math.min(maxH, Math.max(minH, contentH));
		el.style.height = `${next}px`;
		el.style.overflowY = contentH > maxH ? 'auto' : 'hidden';
	};

	fn.getPromptText = function() {
		return D.dom.promptEl.value;
	}

	fn.setPromptText = function(value) {
		D.dom.promptEl.value = value;
		fn.syncPromptInputHeight();
	}

	fn.clearPromptText = function() {
		fn.setPromptText('');
	}

	fn.isPromptTextEmpty = function() {
		return fn.getPromptText().trim().length === 0;
	}

	fn.getPromptCursor = function() {
		return D.dom.promptEl.selectionStart ?? fn.getPromptText().length;
	}

	fn.placeCaretAtEnd = function() {
		const len = fn.getPromptText().length;
		D.dom.promptEl.focus();
		D.dom.promptEl.setSelectionRange(len, len);
	}

	fn.normalizePermissionMode = function(mode) {
		const raw = String(mode || '').trim();
		if (D.const.VALID_MODES.has(raw)) {
			return raw;
		}
		if (raw === 'professor') {
			return D.const.DEFAULT_PERMISSION_MODE;
		}
		return D.const.LEGACY_MODE_MAP[raw] || D.const.DEFAULT_PERMISSION_MODE;
	}

	fn.getPermissionMode = function() {
		return fn.normalizePermissionMode(D.state.selectedPermissionMode);
	}

	fn.syncAgentVignetteUi = function() {
		if (!D.dom.agentVignettesEl) {
			return;
		}
		for (const btn of D.dom.agentVignettesEl.querySelectorAll('.agent-vignette')) {
			if (!(btn instanceof HTMLButtonElement)) {
				continue;
			}
			const mode = btn.dataset.mode || '';
			const on = mode === D.state.selectedPermissionMode;
			btn.classList.toggle('selected', on);
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		}
	}

	fn.setPermissionMode = function(mode, persist = true) {
		D.state.selectedPermissionMode = fn.normalizePermissionMode(mode);
		fn.syncAgentVignetteUi();
		if (persist) {
			D.vscode.postMessage({
				type: 'setPermissionMode',
				permissionMode: D.state.selectedPermissionMode,
			});
		}
	}

	fn.initAgentVignettes = function() {
		if (!D.dom.agentVignettesEl) {
			return;
		}
		fn.syncAgentVignetteUi();
		for (const btn of D.dom.agentVignettesEl.querySelectorAll('.agent-vignette')) {
			if (!(btn instanceof HTMLButtonElement)) {
				continue;
			}
			btn.addEventListener('click', () => {
				const mode = btn.dataset.mode || 'default';
				fn.setPermissionMode(mode, true);
			});
		}
	}

})(globalThis.DroxChat);
