/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	function mutedSetFromState() {
		const raw = D.state.architectLlmParamsMuted;
		return new Set(Array.isArray(raw) ? raw.filter(k => typeof k === 'string') : []);
	}

	fn.syncRoleModelMuteButtonsFromState = function () {
		const panel = D.dom.roleModelPanelEl;
		if (!panel) {
			return;
		}
		const muted = mutedSetFromState();
		for (const field of panel.querySelectorAll('.role-model-field[data-llm-param]')) {
			const key = field.getAttribute('data-llm-param');
			if (!key) {
				continue;
			}
			const isMuted = muted.has(key);
			field.classList.toggle('role-model-field-muted', isMuted);
			const btn = field.querySelector('.role-model-param-mute-btn');
			if (!(btn instanceof HTMLButtonElement)) {
				continue;
			}
			btn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
			const live = btn.getAttribute('data-title-live') || '';
			const mutedTitle = btn.getAttribute('data-title-muted') || '';
			const title = isMuted ? mutedTitle : live;
			btn.title = title;
			btn.setAttribute('aria-label', title);
			const icon = btn.querySelector('.codicon');
			if (icon) {
				icon.classList.toggle('codicon-eye', !isMuted);
				icon.classList.toggle('codicon-eye-closed', isMuted);
			}
		}
	};

	fn.toggleRoleModelParamMute = function (paramKey) {
		if (typeof paramKey !== 'string' || !paramKey) {
			return;
		}
		const muted = mutedSetFromState();
		if (muted.has(paramKey)) {
			muted.delete(paramKey);
		} else {
			muted.add(paramKey);
		}
		D.state.architectLlmParamsMuted = [...muted].sort();
		fn.syncRoleModelMuteButtonsFromState();
		if (typeof fn.persistRoleModelFromPanel === 'function') {
			fn.persistRoleModelFromPanel();
		}
	};

	fn.bindRoleModelMuteButtons = function () {
		const panel = D.dom.roleModelPanelEl;
		if (!panel || panel.dataset.muteBound === '1') {
			return;
		}
		panel.dataset.muteBound = '1';
		panel.addEventListener('click', (e) => {
			const t = e.target;
			if (!(t instanceof Element)) {
				return;
			}
			const btn = t.closest('.role-model-param-mute-btn');
			if (!(btn instanceof HTMLButtonElement) || !panel.contains(btn)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			const key = btn.getAttribute('data-llm-param');
			if (key) {
				fn.toggleRoleModelParamMute(key);
			}
		});
	};
})(globalThis.DroxChat);
