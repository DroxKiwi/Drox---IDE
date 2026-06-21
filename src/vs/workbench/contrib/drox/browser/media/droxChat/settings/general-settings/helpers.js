/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.readOptionalNumber = function(raw) {
		const s = String(raw ?? '').trim();
		if (!s) {
			return undefined;
		}
		const n = Number(s);
		return Number.isFinite(n) ? n : undefined;
	};

	fn.syncConnectionVignetteAttention = function() {
		const configured = typeof fn.isConnectionConfigured === 'function' && fn.isConnectionConfigured();
		const wizardOpen = Boolean(D.state.connectionWizard?.open);
		const panelOpen = Boolean(D.state.generalSettingsPanelOpen);
		const busy = Boolean(D.state.busy);
		const needsAttention = !configured && !wizardOpen && !busy;

		const vignette = D.dom.generalSettingsVignetteEl || document.getElementById('general-settings-vignette');
		if (vignette) {
			vignette.classList.toggle('connection-attention', needsAttention && !panelOpen);
		}

		const connectBtn = document.getElementById('general-settings-connect-ia');
		if (connectBtn) {
			connectBtn.classList.toggle('connection-attention', needsAttention && panelOpen);
		}

		fn.syncArchitectVignetteBlocked(configured);
	};

	fn.isArchitectVignetteBlocked = function() {
		return typeof fn.isConnectionConfigured === 'function' && !fn.isConnectionConfigured();
	};

	fn.redirectToConnectionSetup = function() {
		if (typeof fn.closeRoleModelPanel === 'function') {
			fn.closeRoleModelPanel();
		}
		if (typeof fn.closeConnectionWizard === 'function') {
			fn.closeConnectionWizard();
		}
		if (typeof fn.openGeneralSettingsPanel === 'function') {
			fn.openGeneralSettingsPanel();
		}
	};

	fn.syncArchitectVignetteBlocked = function(configured) {
		const el = D.dom.architectModelVignetteEl || document.getElementById('architect-model-vignette');
		if (!el) {
			return;
		}
		const blocked = configured === false || (configured === undefined && fn.isArchitectVignetteBlocked());
		if (!el.dataset.defaultTitle) {
			el.dataset.defaultTitle = el.getAttribute('title') || 'Architect';
		}
		el.classList.toggle('connection-blocked', blocked);
		el.setAttribute('aria-disabled', blocked ? 'true' : 'false');
		if (blocked) {
			el.title = 'Connect the engine (Settings) before choosing a model';
			const archHint = document.getElementById('architect-vignette-model-hint');
			if (archHint) {
				archHint.textContent = 'Server required';
			}
			if (D.state.rolePanelOpen === 'architect' && typeof fn.closeRoleModelPanel === 'function') {
				fn.closeRoleModelPanel();
			}
		} else {
			el.title = el.dataset.defaultTitle;
			if (typeof fn.syncRoleModelVignetteHints === 'function') {
				fn.syncRoleModelVignetteHints();
			}
		}
	};

	fn.syncGeneralSettingsVignetteHint = function() {
		const hint = document.getElementById('general-settings-vignette-hint');
		if (!hint) {
			return;
		}
		const s = D.state.generalSettings || {};
		const needsConnection = typeof fn.isConnectionConfigured === 'function' && !fn.isConnectionConfigured();
		if (needsConnection) {
			hint.textContent = 'Connect engine';
		} else {
			const parts = [];
			if (s.connectionSummary) {
				parts.push(String(s.connectionSummary).slice(0, 32));
			} else if (s.server) {
				parts.push(String(s.server).replace(/^https?:\/\//, '').slice(0, 18));
			}
			if (s.maxIterations && document.getElementById('general-settings-max-iterations')) {
				parts.push(`×${s.maxIterations}`);
			}
			hint.textContent = parts.length ? parts.join(' · ') : '—';
		}
		if (typeof fn.syncConnectionSummaryInPanel === 'function') {
			fn.syncConnectionSummaryInPanel();
		}
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	};
})(globalThis.DroxChat);
