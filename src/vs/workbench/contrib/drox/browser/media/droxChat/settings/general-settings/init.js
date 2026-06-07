/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.initGeneralSettingsVignettes = function() {
		if (!D.dom.generalSettingsVignetteEl) {
			return;
		}
		D.dom.generalSettingsVignetteEl.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			fn.toggleGeneralSettingsPanel();
		});
		if (D.dom.generalSettingsPanelCloseEl) {
			D.dom.generalSettingsPanelCloseEl.addEventListener('click', () => {
				fn.persistGeneralSettingsFromPanel();
				fn.closeGeneralSettingsPanel();
			});
		}
		if (D.dom.generalSettingsOpenAllEl) {
			D.dom.generalSettingsOpenAllEl.addEventListener('click', () => {
				D.vscode.postMessage({ type: 'openSettings' });
			});
		}
		const panel = D.dom.generalSettingsPanelEl;
		if (panel) {
			for (const el of panel.querySelectorAll('input, select')) {
				el.addEventListener('change', () => {
					if (el.id === 'general-settings-engine-strictness') {
						fn.syncEngineTuningPanelVisibility();
					}
					fn.persistGeneralSettingsFromPanel();
				});
			}
		}
		document.addEventListener('click', (e) => {
			if (!D.state.generalSettingsPanelOpen || !panel) {
				return;
			}
			const t = e.target;
			if (!(t instanceof Node)) {
				return;
			}
			if (panel.contains(t)) {
				return;
			}
			if (D.dom.generalSettingsVignetteEl?.contains(t)) {
				return;
			}
			fn.persistGeneralSettingsFromPanel();
			fn.closeGeneralSettingsPanel();
		});
		fn.syncGeneralSettingsVignetteHint();
	};

	const prevOpenRole = fn.openRoleModelPanel;
	if (typeof prevOpenRole === 'function') {
		fn.openRoleModelPanel = function(role) {
			fn.closeGeneralSettingsPanel();
			prevOpenRole(role);
		};
	}
})(globalThis.DroxChat);
