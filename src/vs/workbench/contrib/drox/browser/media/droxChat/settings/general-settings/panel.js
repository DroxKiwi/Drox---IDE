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
		setVal('general-settings-llm-provider', s.llmProvider || 'ollama');
		setVal('general-settings-server', s.server || '');
		setVal('general-settings-api-key', s.apiKey || '');
		setVal('general-settings-executable-path', s.executablePath || '');
		setVal('general-settings-keep-alive', s.keepAlive || '');
		setVal('general-settings-max-iterations', s.maxIterations ?? 12);
		setVal('general-settings-native-thinking', s.nativeThinking);
		setVal('general-settings-primary-language', s.primaryLanguage || '');
		setVal('general-settings-max-tokens', s.maxTokens ?? '');
		setVal('general-settings-num-predict', s.numPredict ?? '');
		setVal('general-settings-warm-start', s.warmStart !== false);
		setVal('general-settings-confirm-file-writes', s.confirmFileWrites);
		setVal('general-settings-open-modified-files', s.openModifiedFiles !== false);
		setVal('general-settings-add-diagnostic-on-hover', s.addDiagnosticOnHover);
		setVal('general-settings-mcp-tools-enabled', s.mcpToolsEnabled !== false);
		setVal('general-settings-show-chat-errors-warnings', s.showChatErrorsAndWarnings !== false);
		setVal('general-settings-engine-strictness', s.engineStrictness || 'normal');
		const tuning = s.engineTuning && typeof s.engineTuning === 'object' ? s.engineTuning : {};
		setVal('general-settings-tuning-read-budget-percent', tuning.readBudgetPercent ?? 70);
		setVal('general-settings-tuning-loop-strikes', tuning.loopStrikesBeforeAbort ?? 4);
		if (document.getElementById('general-settings-tuning-max-reads-before-delegate')) {
			setVal('general-settings-tuning-max-reads-before-delegate', tuning.maxReadsBeforeDelegate ?? 16);
			setVal('general-settings-tuning-max-mutations-before-delegate-nudge', tuning.maxMutationsBeforeDelegateNudge ?? 3);
			setVal('general-settings-tuning-require-delegate', tuning.requireDelegateBeforeTodoComplete === true);
		}
		setVal('general-settings-tuning-context-snip', tuning.contextSnipEnabled !== false);
		fn.syncEngineTuningPanelVisibility();
		const disabled = D.state.busy;
		const panel = D.dom.generalSettingsPanelEl;
		if (panel) {
			for (const input of panel.querySelectorAll('input, select, button.general-settings-panel-btn')) {
				if (input.id === 'general-settings-open-all') {
					continue;
				}
				input.disabled = disabled;
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
		const strictness = str('general-settings-engine-strictness') || 'normal';
		const patch = {
			llmProvider: str('general-settings-llm-provider') || 'ollama',
			server: str('general-settings-server'),
			apiKey: str('general-settings-api-key'),
			executablePath: str('general-settings-executable-path'),
			keepAlive: str('general-settings-keep-alive'),
			maxIterations: num('general-settings-max-iterations') ?? 12,
			nativeThinking: bool('general-settings-native-thinking'),
			primaryLanguage: str('general-settings-primary-language'),
			maxTokens: num('general-settings-max-tokens'),
			numPredict: num('general-settings-num-predict'),
			warmStart: bool('general-settings-warm-start'),
			confirmFileWrites: bool('general-settings-confirm-file-writes'),
			openModifiedFiles: bool('general-settings-open-modified-files'),
			addDiagnosticOnHover: bool('general-settings-add-diagnostic-on-hover'),
			mcpToolsEnabled: bool('general-settings-mcp-tools-enabled'),
			showChatErrorsAndWarnings: bool('general-settings-show-chat-errors-warnings'),
			engineStrictness: strictness,
		};
		if (strictness === 'custom') {
			const tuning = {
				readBudgetPercent: num('general-settings-tuning-read-budget-percent'),
				loopStrikesBeforeAbort: num('general-settings-tuning-loop-strikes'),
				contextSnipEnabled: bool('general-settings-tuning-context-snip'),
			};
			if (document.getElementById('general-settings-tuning-max-reads-before-delegate')) {
				tuning.maxReadsBeforeDelegate = num('general-settings-tuning-max-reads-before-delegate');
				tuning.maxMutationsBeforeDelegateNudge = num('general-settings-tuning-max-mutations-before-delegate-nudge');
				tuning.requireDelegateBeforeTodoComplete = bool('general-settings-tuning-require-delegate');
			}
			patch.engineTuning = tuning;
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
	};

	fn.closeGeneralSettingsPanel = function() {
		const panel = D.dom.generalSettingsPanelEl;
		if (D.dom.generalSettingsVignetteEl) {
			D.dom.generalSettingsVignetteEl.classList.remove('panel-open');
			D.dom.generalSettingsVignetteEl.setAttribute('aria-expanded', 'false');
		}
		if (panel) {
			panel.hidden = true;
		}
		D.state.generalSettingsPanelOpen = false;
	};

	fn.toggleGeneralSettingsPanel = function() {
		if (D.state.generalSettingsPanelOpen) {
			fn.closeGeneralSettingsPanel();
			return;
		}
		fn.openGeneralSettingsPanel();
	};
})(globalThis.DroxChat);
