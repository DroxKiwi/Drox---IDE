/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.fillGeneralSettingsPanel = function() {
		const s = D.state.generalSettings || {};
		const setVal = (id, value) => {
			const el = document.getElementById(id);
			if (!el) {
				return;
			}
			if (el.type === 'checkbox') {
				el.checked = Boolean(value);
			} else {
				el.value = value === undefined || value === null ? '' : String(value);
			}
		};
		if (typeof fn.syncConnectionSummaryInPanel === 'function') {
			fn.syncConnectionSummaryInPanel();
		}
		setVal('general-settings-max-iterations', s.maxIterations ?? 50);
		setVal('general-settings-native-thinking', s.nativeThinking);
		setVal('general-settings-primary-language', s.primaryLanguage || '');
		setVal('general-settings-warm-start', s.warmStart !== false);
		setVal('general-settings-confirm-file-writes', s.confirmFileWrites);
		setVal('general-settings-open-modified-files', s.openModifiedFiles !== false);
		setVal('general-settings-add-diagnostic-on-hover', s.addDiagnosticOnHover);
		setVal('general-settings-mcp-tools-enabled', s.mcpToolsEnabled !== false);
		setVal('general-settings-show-chat-errors-warnings', s.showChatErrorsAndWarnings !== false);
		const disabled = D.state.busy;
		const panel = D.dom.generalSettingsPanelEl;
		if (panel) {
			for (const input of panel.querySelectorAll('input, select, button.general-settings-panel-btn')) {
				if (input.id === 'general-settings-open-all' || input.id === 'general-settings-connect-ia') {
					continue;
				}
				input.disabled = disabled;
			}
			const connectBtn = document.getElementById('general-settings-connect-ia');
			if (connectBtn) {
				connectBtn.disabled = disabled;
			}
		}
	};

	fn.collectGeneralSettingsPatch = function() {
		const num = (id) => fn.readOptionalNumber(document.getElementById(id)?.value);
		const str = (id) => {
			const el = document.getElementById(id);
			return el && 'value' in el ? String(el.value).trim() : '';
		};
		const bool = (id) => {
			const el = document.getElementById(id);
			return el && el.type === 'checkbox' ? el.checked : false;
		};
		const patch = {
			nativeThinking: bool('general-settings-native-thinking'),
			primaryLanguage: str('general-settings-primary-language'),
			warmStart: bool('general-settings-warm-start'),
			confirmFileWrites: bool('general-settings-confirm-file-writes'),
			openModifiedFiles: bool('general-settings-open-modified-files'),
			addDiagnosticOnHover: bool('general-settings-add-diagnostic-on-hover'),
			mcpToolsEnabled: bool('general-settings-mcp-tools-enabled'),
			showChatErrorsAndWarnings: bool('general-settings-show-chat-errors-warnings'),
		};
		if (document.getElementById('general-settings-max-iterations')) {
			patch.maxIterations = num('general-settings-max-iterations') ?? 50;
		}
		return patch;
	};

	fn.persistGeneralSettingsFromPanel = function() {
		if (!D.state.generalSettingsPanelOpen) {
			return;
		}
		const patch = fn.collectGeneralSettingsPatch();
		D.state.generalSettings = { ...D.state.generalSettings, ...patch };
		fn.syncGeneralSettingsVignetteHint();
		D.vscode.postMessage({ type: 'setGeneralSettings', settings: patch });
	};

	fn.openGeneralSettingsPanel = function() {
		const panel = D.dom.generalSettingsPanelEl;
		const vignette = D.dom.generalSettingsVignetteEl;
		if (!panel || !vignette) {
			return;
		}
		if (typeof fn.closeConnectionWizard === 'function') {
			fn.closeConnectionWizard();
		}
		if (typeof fn.closeRoleModelPanel === 'function') {
			fn.closeRoleModelPanel();
		}
		D.state.generalSettingsPanelOpen = true;
		vignette.classList.add('panel-open');
		vignette.setAttribute('aria-expanded', 'true');
		fn.fillGeneralSettingsPanel();
		const rect = vignette.getBoundingClientRect();
		panel.style.left = `${Math.max(8, rect.left + rect.width / 2 - 170)}px`;
		panel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
		panel.hidden = false;
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	};

	fn.closeGeneralSettingsPanel = function() {
		const panel = D.dom.generalSettingsPanelEl;
		if (typeof fn.closeConnectionWizard === 'function') {
			fn.closeConnectionWizard();
		}
		if (D.dom.generalSettingsVignetteEl) {
			D.dom.generalSettingsVignetteEl.classList.remove('panel-open');
			D.dom.generalSettingsVignetteEl.setAttribute('aria-expanded', 'false');
		}
		if (panel) {
			panel.hidden = true;
		}
		D.state.generalSettingsPanelOpen = false;
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	};

	fn.toggleGeneralSettingsPanel = function() {
		if (D.state.generalSettingsPanelOpen) {
			fn.closeGeneralSettingsPanel();
			return;
		}
		fn.openGeneralSettingsPanel();
	};
})(globalThis.DroxChat);
