/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	/** Panneau flottant + wizard connexion (sans la vignette toolbar). */
	fn.initGeneralSettingsPanelShell = function() {
		if (D.state._generalSettingsPanelShellInit) {
			return;
		}

		const panel = D.dom.generalSettingsPanelEl || document.getElementById('general-settings-panel');
		if (D.dom.generalSettingsPanelCloseEl) {
			D.dom.generalSettingsPanelCloseEl.addEventListener('click', () => {
				fn.persistGeneralSettingsFromPanel();
				fn.closeGeneralSettingsPanel();
			});
		}
		if (D.dom.generalSettingsOpenAllEl) {
			D.dom.generalSettingsOpenAllEl.addEventListener('click', () => {
				fn.persistGeneralSettingsFromPanel();
				fn.closeGeneralSettingsPanel();
				D.vscode.postMessage({ type: 'openSettings' });
			});
		}
		if (panel) {
			for (const el of panel.querySelectorAll('input, select')) {
				el.addEventListener('change', () => {
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
			const wizard = document.getElementById('drox-connection-wizard');
			if (wizard && !wizard.hidden && wizard.contains(t)) {
				return;
			}
			if (D.state.connectionWizard?.open) {
				return;
			}
			fn.persistGeneralSettingsFromPanel();
			fn.closeGeneralSettingsPanel();
		});
		if (typeof fn.initConnectionWizard === 'function') {
			fn.initConnectionWizard();
		}
		if (typeof fn.syncGeneralSettingsVignetteHint === 'function') {
			fn.syncGeneralSettingsVignetteHint();
		}
		D.state._generalSettingsPanelShellInit = true;
	};

	fn.initGeneralSettingsVignettes = function() {
		fn.initGeneralSettingsPanelShell();
		if (!D.dom.generalSettingsVignetteEl) {
			return;
		}
		if (D.dom.generalSettingsVignetteEl.dataset.droxVignetteWired === '1') {
			return;
		}
		if (D.dom.generalSettingsVignetteEl.classList.contains('drox-agents-panel-picker-trigger')) {
			return;
		}
		D.dom.generalSettingsVignetteEl.dataset.droxVignetteWired = '1';
		D.dom.generalSettingsVignetteEl.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			fn.toggleGeneralSettingsPanel();
		});
	};

	const prevOpenRole = fn.openRoleModelPanel;
	if (typeof prevOpenRole === 'function') {
		fn.openRoleModelPanel = function(role) {
			fn.closeGeneralSettingsPanel();
			prevOpenRole(role);
		};
	}
})(globalThis.DroxChat);
