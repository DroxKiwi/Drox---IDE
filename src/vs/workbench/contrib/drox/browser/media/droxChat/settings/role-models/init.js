/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.initRoleModelVignettes = function() {
		if (!D.dom.roleModelVignettesEl) {
			return;
		}
		if (D.dom.architectModelVignetteEl) {
			D.dom.architectModelVignetteEl.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
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
		const architectInputs = [
			D.dom.roleModelPanelNumCtxEl,
			D.dom.roleModelPanelTopPEl,
			D.dom.roleModelPanelTopKEl,
			D.dom.roleModelPanelRepeatPenaltyEl,
			D.dom.roleModelPanelMinPEl,
			D.dom.roleModelPanelSeedEl,
			D.dom.roleModelPanelTemperatureEl,
		];
		for (const el of architectInputs) {
			if (el) {
				el.addEventListener('change', () => fn.persistRoleModelFromPanel());
			}
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
