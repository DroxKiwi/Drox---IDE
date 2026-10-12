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
		if (D.dom.roleModelPanelMaxIterationsEl) {
			D.dom.roleModelPanelMaxIterationsEl.value = String(s.maxIterations ?? (D.const.DEFAULT_MAX_ITERATIONS ?? 50));
		}
		const exploreMax = s.subagentsMaxIterations ?? (D.const.DEFAULT_SUBAGENTS_MAX_ITERATIONS ?? 25);
		setVal('general-settings-explore-max-iterations', exploreMax);
		if (D.dom.roleModelPanelExploreMaxIterationsEl) {
			D.dom.roleModelPanelExploreMaxIterationsEl.value = String(exploreMax);
		}
		setVal('general-settings-subagents-enabled', s.subagentsEnabled !== false);
		setVal('general-settings-subagents-execution-think', s.subagentsExecutionThink === true);
		setVal('general-settings-subagents-report-think', s.subagentsReportThink === true);
		setVal('general-settings-project-rules-enabled', s.projectRulesEnabled !== false);
		setVal('general-settings-outside-ws-read', s.allowOutsideWorkspaceRead);
		setVal('general-settings-outside-ws-write', s.allowOutsideWorkspaceWrite);
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
		if (document.getElementById('general-settings-explore-max-iterations')) {
			const exploreRaw = num('general-settings-explore-max-iterations');
			if (exploreRaw !== undefined && Number.isFinite(exploreRaw)) {
				patch.subagentsMaxIterations = Math.max(1, Math.floor(exploreRaw));
			}
		}
		if (document.getElementById('general-settings-subagents-enabled')) {
			patch.subagentsEnabled = bool('general-settings-subagents-enabled');
		}
		if (document.getElementById('general-settings-subagents-execution-think')) {
			patch.subagentsExecutionThink = bool('general-settings-subagents-execution-think');
		}
		if (document.getElementById('general-settings-subagents-report-think')) {
			patch.subagentsReportThink = bool('general-settings-subagents-report-think');
		}
		if (document.getElementById('general-settings-project-rules-enabled')) {
			patch.projectRulesEnabled = bool('general-settings-project-rules-enabled');
		}
		if (document.getElementById('general-settings-outside-ws-read')) {
			patch.allowOutsideWorkspaceRead = bool('general-settings-outside-ws-read');
		}
		if (document.getElementById('general-settings-outside-ws-write')) {
			patch.allowOutsideWorkspaceWrite = bool('general-settings-outside-ws-write');
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
		const isAgentsComposer = Boolean(panel.closest('.drox-agents-composer-panels-mount'));
		const titleEl = panel.querySelector('.general-settings-panel-head strong');
		if (titleEl) {
			titleEl.textContent = isAgentsComposer ? 'Server settings' : 'General settings';
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
