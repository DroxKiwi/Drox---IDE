/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.initRoleModelVignettes = function() {
		if (!D.dom.architectModelVignetteEl && !D.dom.roleModelVignettesEl) {
			return;
		}
		if (D.dom.architectModelVignetteEl && !D.dom.architectModelVignetteEl.classList.contains('drox-agents-panel-picker-trigger')) {
			D.dom.architectModelVignetteEl.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (typeof fn.isArchitectVignetteBlocked === 'function' && fn.isArchitectVignetteBlocked()) {
					if (typeof fn.redirectToConnectionSetup === 'function') {
						fn.redirectToConnectionSetup();
					}
					return;
				}
				fn.toggleRoleModelPanel();
			});
		}
		if (D.dom.roleModelPanelCloseEl) {
			D.dom.roleModelPanelCloseEl.addEventListener('click', () => {
				fn.persistRoleModelFromPanel();
				fn.closeRoleModelPanel();
			});
		}
		if (D.dom.roleModelPanelSelectEl) {
			D.dom.roleModelPanelSelectEl.addEventListener('change', () => {
				if (D.dom.roleModelPanelSelectEl) {
					D.state.architectModel = D.dom.roleModelPanelSelectEl.value.trim();
				}
				fn.persistRoleModelFromPanel();
			});
		}
		if (D.dom.roleModelPanelNumCtxEl) {
			D.dom.roleModelPanelNumCtxEl.addEventListener('change', () => {
				fn.onArchitectNumCtxPresetChange();
				const isCustom = D.dom.roleModelPanelNumCtxEl?.value === D.const.ARCHITECT_NUM_CTX_CUSTOM;
				if (!isCustom) {
					fn.persistRoleModelFromPanel();
				} else {
					fn.syncRoleModelVignetteHints();
				}
			});
		}
		if (D.dom.roleModelPanelNumCtxCustomEl) {
			D.dom.roleModelPanelNumCtxCustomEl.addEventListener('input', () => {
				const numCtx = fn.readArchitectNumCtxFromPanel();
				if (numCtx !== undefined) {
					D.state.architectNumCtx = numCtx;
				}
				fn.syncRoleModelVignetteHints();
			});
			D.dom.roleModelPanelNumCtxCustomEl.addEventListener('change', () => fn.persistRoleModelFromPanel());
			D.dom.roleModelPanelNumCtxCustomEl.addEventListener('blur', () => fn.persistRoleModelFromPanel());
		}
		const architectInputs = [
			D.dom.roleModelPanelTemperatureEl,
			D.dom.roleModelPanelTopPEl,
			D.dom.roleModelPanelRepeatPenaltyEl,
			D.dom.roleModelPanelMinPEl,
			D.dom.roleModelPanelTopKEl,
			D.dom.roleModelPanelSeedEl,
			D.dom.roleModelPanelPresencePenaltyEl,
			D.dom.roleModelPanelFrequencyPenaltyEl,
			D.dom.roleModelPanelMaxTokensEl,
			D.dom.roleModelPanelKeepAliveEl,
			D.dom.roleModelPanelReasoningEffortEl,
			D.dom.roleModelPanelThinkingBudgetEl,
		];
		for (const el of architectInputs) {
			if (el) {
				el.addEventListener('change', () => fn.persistRoleModelFromPanel());
			}
		}
		if (typeof fn.bindRoleModelMuteButtons === 'function') {
			fn.bindRoleModelMuteButtons();
		}
		if (typeof fn.syncRoleModelMuteButtonsFromState === 'function') {
			fn.syncRoleModelMuteButtonsFromState();
		}
		if (D.dom.roleModelPanelReloadEl) {
			D.dom.roleModelPanelReloadEl.addEventListener('click', () => fn.refreshLlmModels());
		}
		document.addEventListener('click', (e) => {
			if (!D.state.rolePanelOpen || !D.dom.roleModelPanelEl) {
				return;
			}
			const t = e.target;
			if (!(t instanceof Node)) {
				return;
			}
			if (D.dom.roleModelPanelEl.contains(t)) {
				return;
			}
			if (D.dom.architectModelVignetteEl?.contains(t)) {
				return;
			}
			fn.persistRoleModelFromPanel();
			fn.closeRoleModelPanel();
		});
		fn.syncRoleModelVignetteHints();
	};
})(globalThis.DroxChat);
