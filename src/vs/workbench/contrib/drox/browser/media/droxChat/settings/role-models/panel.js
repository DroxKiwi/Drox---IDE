/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	function formatPanelNumber(value) {
		return value !== '' && value !== undefined && value !== null ? String(value) : '';
	}

	fn.syncRoleModelPanelFieldsFromState = function () {
		fn.fillRoleModelPanelSelect();
		if (D.dom.roleModelPanelNumCtxEl) {
			fn.syncArchitectNumCtxPanelFromState();
		}
		if (D.dom.roleModelPanelTemperatureEl) {
			D.dom.roleModelPanelTemperatureEl.value = formatPanelNumber(D.state.architectTemperature);
		}
		if (D.dom.roleModelPanelTopPEl) {
			D.dom.roleModelPanelTopPEl.value = formatPanelNumber(D.state.architectTopP);
		}
		if (D.dom.roleModelPanelRepeatPenaltyEl) {
			D.dom.roleModelPanelRepeatPenaltyEl.value = formatPanelNumber(D.state.architectRepeatPenalty);
		}
		if (D.dom.roleModelPanelMinPEl) {
			D.dom.roleModelPanelMinPEl.value = formatPanelNumber(D.state.architectMinP);
		}
		if (D.dom.roleModelPanelTopKEl) {
			D.dom.roleModelPanelTopKEl.value = formatPanelNumber(D.state.architectTopK);
		}
		if (D.dom.roleModelPanelSeedEl) {
			D.dom.roleModelPanelSeedEl.value = formatPanelNumber(D.state.architectSeed);
		}
		if (D.dom.roleModelPanelPresencePenaltyEl) {
			D.dom.roleModelPanelPresencePenaltyEl.value = formatPanelNumber(D.state.architectPresencePenalty);
		}
		if (D.dom.roleModelPanelFrequencyPenaltyEl) {
			D.dom.roleModelPanelFrequencyPenaltyEl.value = formatPanelNumber(D.state.architectFrequencyPenalty);
		}
		if (D.dom.roleModelPanelMaxTokensEl) {
			D.dom.roleModelPanelMaxTokensEl.value = formatPanelNumber(D.state.architectMaxTokens);
		}
		if (D.dom.roleModelPanelKeepAliveEl) {
			D.dom.roleModelPanelKeepAliveEl.value = D.state.architectKeepAlive ? String(D.state.architectKeepAlive) : '';
		}
		if (typeof fn.syncRoleModelMuteButtonsFromState === 'function') {
			fn.syncRoleModelMuteButtonsFromState();
		}
	};

	fn.openRoleModelPanel = function() {
		if (typeof fn.isArchitectVignetteBlocked === 'function' && fn.isArchitectVignetteBlocked()) {
			if (typeof fn.redirectToConnectionSetup === 'function') {
				fn.redirectToConnectionSetup();
			}
			return;
		}
		const panel = D.dom.roleModelPanelEl;
		const vignette = D.dom.architectModelVignetteEl;
		if (!panel || !vignette) {
			return;
		}
		D.state.rolePanelOpen = 'architect';
		vignette.classList.add('panel-open');
		vignette.setAttribute('aria-expanded', 'true');
		if (D.dom.roleModelPanelTitleEl) {
			const isAgentsComposer = Boolean(panel.closest('.drox-agents-composer-panels-mount'));
			D.dom.roleModelPanelTitleEl.textContent = isAgentsComposer ? 'Model settings' : 'Architect';
		}
		panel.classList.add('role-model-architect-mode');
		panel.classList.remove('role-model-executor-mode');
		fn.syncRoleModelPanelFieldsFromState();
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
