/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.openRoleModelPanel = function() {
		const panel = D.dom.roleModelPanelEl;
		const vignette = D.dom.architectModelVignetteEl;
		if (!panel || !vignette) {
			return;
		}
		D.state.rolePanelOpen = 'architect';
		vignette.classList.add('panel-open');
		vignette.setAttribute('aria-expanded', 'true');
		if (D.dom.roleModelPanelTitleEl) {
			D.dom.roleModelPanelTitleEl.textContent = 'Architect';
		}
		panel.classList.add('role-model-architect-mode');
		panel.classList.remove('role-model-executor-mode');
		fn.fillRoleModelPanelSelect();
		if (D.dom.roleModelPanelNumCtxEl) {
			fn.syncArchitectNumCtxPanelFromState();
		}
		if (D.dom.roleModelPanelTopPEl) {
			D.dom.roleModelPanelTopPEl.value =
				D.state.architectTopP !== '' && D.state.architectTopP !== undefined
					? String(D.state.architectTopP)
					: '';
		}
		if (D.dom.roleModelPanelTopKEl) {
			D.dom.roleModelPanelTopKEl.value =
				D.state.architectTopK !== '' && D.state.architectTopK !== undefined
					? String(D.state.architectTopK)
					: '';
		}
		if (D.dom.roleModelPanelRepeatPenaltyEl) {
			D.dom.roleModelPanelRepeatPenaltyEl.value =
				D.state.architectRepeatPenalty !== '' && D.state.architectRepeatPenalty !== undefined
					? String(D.state.architectRepeatPenalty)
					: '';
		}
		if (D.dom.roleModelPanelMinPEl) {
			D.dom.roleModelPanelMinPEl.value =
				D.state.architectMinP !== '' && D.state.architectMinP !== undefined
					? String(D.state.architectMinP)
					: '';
		}
		if (D.dom.roleModelPanelSeedEl) {
			D.dom.roleModelPanelSeedEl.value =
				D.state.architectSeed !== '' && D.state.architectSeed !== undefined
					? String(D.state.architectSeed)
					: '';
		}
		if (D.dom.roleModelPanelTemperatureEl) {
			D.dom.roleModelPanelTemperatureEl.value =
				D.state.architectTemperature !== '' && D.state.architectTemperature !== undefined
					? String(D.state.architectTemperature)
					: '';
		}
		const rect = vignette.getBoundingClientRect();
		panel.style.left = `${Math.max(8, rect.left - 8)}px`;
		panel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
		panel.hidden = false;
	};

	fn.closeRoleModelPanel = function() {
		const panel = D.dom.roleModelPanelEl;
		if (D.dom.architectModelVignetteEl) {
			D.dom.architectModelVignetteEl.classList.remove('panel-open');
			D.dom.architectModelVignetteEl.setAttribute('aria-expanded', 'false');
		}
		if (panel) {
			panel.hidden = true;
		}
		D.state.rolePanelOpen = null;
	};

	fn.toggleRoleModelPanel = function() {
		if (D.state.rolePanelOpen === 'architect') {
			fn.closeRoleModelPanel();
			return;
		}
		fn.closeRoleModelPanel();
		fn.openRoleModelPanel();
	};
})(globalThis.DroxChat);
