/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	D.state.generalSettings = {};
	D.state.generalSettingsPanelOpen = false;

	const CHAT_ISSUE_SELECTORS =
		'.msg.error, .msg-explore-notice, .msg-loop-intervention-warn, .msg-loop-intervention-abort, .msg-tool.error, .executor-action-line.error, .drox-explore-line.error, .msg-subagent-failed, .msg-subagent-partial';

	fn.isChatErrorsWarningsVisible = function () {
		return D.state.generalSettings?.showChatErrorsAndWarnings !== false;
	};

	fn.markChatIssueElement = function (el) {
		if (!el || fn.isChatErrorsWarningsVisible()) {
			return;
		}
		el.classList.add('drox-chat-issue-hidden');
	};

	fn.syncChatErrorsWarningsVisibility = function () {
		const show = fn.isChatErrorsWarningsVisible();
		const roots = [D.dom.logEl, D.state.exploreBodyEl, D.state.exploreMetaTrayEl?.querySelector('.drox-explore-meta-inner')].filter(Boolean);
		for (const root of roots) {
			for (const el of root.querySelectorAll(CHAT_ISSUE_SELECTORS)) {
				if (el.closest('.msg-todos, [data-section="plan"] .msg-todos')) {
					continue;
				}
				el.classList.toggle('drox-chat-issue-hidden', !show);
			}
			for (const tray of root.querySelectorAll(
				'.drox-explore-issues-tray, .drox-log-issues-tray',
			)) {
				tray.classList.toggle('drox-chat-issue-hidden', !show);
			}
		}
		if (D.state.exploreMetaTrayEl) {
			const hasVisibleIssue =
				show &&
				Boolean(D.state.exploreIssuesTray?.trayEl?.isConnected && !D.state.exploreIssuesTray.trayEl.hidden);
			D.state.exploreMetaTrayEl.classList.toggle('drox-meta-has-issues', hasVisibleIssue);
		}
	};

	function readOptionalNumber(raw) {
		const s = String(raw ?? '').trim();
		if (!s) {
			return undefined;
		}
		const n = Number(s);
		return Number.isFinite(n) ? n : undefined;
	}

	function syncGeneralSettingsVignetteHint() {
		const hint = document.getElementById('general-settings-vignette-hint');
		if (!hint) {
			return;
		}
		const s = D.state.generalSettings || {};
		const parts = [];
		if (s.server) {
			parts.push(String(s.server).replace(/^https?:\/\//, '').slice(0, 18));
		}
		if (s.maxIterations) {
			parts.push(`×${s.maxIterations}`);
		}
		hint.textContent = parts.length ? parts.join(' · ') : '—';
	}

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
		const num = (id) => readOptionalNumber(document.getElementById(id)?.value);
		const str = (id) => {
			const el = document.getElementById(id);
			return el && 'value' in el ? String(el.value).trim() : '';
		};
		const bool = (id) => {
			const el = document.getElementById(id);
			return el && el.type === 'checkbox' ? el.checked : false;
		};
		return {
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
		};
	};

	fn.persistGeneralSettingsFromPanel = function() {
		if (!D.state.generalSettingsPanelOpen) {
			return;
		}
		const patch = fn.collectGeneralSettingsPatch();
		D.state.generalSettings = { ...D.state.generalSettings, ...patch };
		syncGeneralSettingsVignetteHint();
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

	fn.applyGeneralSettingsFromHost = function(payload) {
		if (!payload || typeof payload !== 'object') {
			return;
		}
		const s = payload.settings && typeof payload.settings === 'object' ? payload.settings : payload;
		D.state.generalSettings = { ...D.state.generalSettings, ...s };
		syncGeneralSettingsVignetteHint();
		if (D.state.generalSettingsPanelOpen) {
			fn.fillGeneralSettingsPanel();
		}
		if (typeof fn.syncChatErrorsWarningsVisibility === 'function') {
			fn.syncChatErrorsWarningsVisibility();
		}
	};

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
				el.addEventListener('change', () => fn.persistGeneralSettingsFromPanel());
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
		syncGeneralSettingsVignetteHint();
	};

	const prevOpenRole = fn.openRoleModelPanel;
	if (typeof prevOpenRole === 'function') {
		fn.openRoleModelPanel = function(role) {
			fn.closeGeneralSettingsPanel();
			prevOpenRole(role);
		};
	}
})(globalThis.DroxChat);
