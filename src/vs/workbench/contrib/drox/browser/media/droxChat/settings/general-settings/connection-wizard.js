/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const WIZARD_STEPS = 3;
	let testRequestCounter = 0;

	function wizardEl() {
		return document.getElementById('drox-connection-wizard');
	}

	function wizardBodyEl() {
		return document.getElementById('drox-connection-wizard-body');
	}

	function wizardTitleEl() {
		return document.getElementById('drox-connection-wizard-title');
	}

	function wizardStepLabelEl() {
		return document.getElementById('drox-connection-wizard-step-label');
	}

	function wizardBackBtn() {
		return document.getElementById('drox-connection-wizard-back');
	}

	function wizardNextBtn() {
		return document.getElementById('drox-connection-wizard-next');
	}

	function wizardFinishBtn() {
		return document.getElementById('drox-connection-wizard-finish');
	}

	function wizardResetBtn() {
		return document.getElementById('drox-connection-wizard-reset');
	}

	function emptyHeadersRow() {
		return { name: '', value: '' };
	}

	fn.isConnectionConfigured = function(settings) {
		const s = settings || D.state.generalSettings || {};
		const hosting = s.llmHosting === 'cloud' || s.llmHosting === 'personal';
		return hosting && Boolean(String(s.server || '').trim());
	};

	fn.connectionWizardResetDraft = function(fromSettings, options) {
		const s = fromSettings || D.state.generalSettings || {};
		const headers = s.llmHeaders && typeof s.llmHeaders === 'object'
			? Object.entries(s.llmHeaders).map(([name, value]) => ({ name: String(name), value: String(value) }))
			: [];
		if (headers.length === 0) {
			headers.push(emptyHeadersRow());
		}
		const configured = fn.isConnectionConfigured(s);
		D.state.connectionWizard = {
			open: false,
			step: options?.step ?? 1,
			hosting: s.llmHosting === 'cloud' || s.llmHosting === 'personal' ? s.llmHosting : null,
			provider: s.llmProvider || null,
			server: s.server || '',
			apiKey: s.apiKey || '',
			formValues: {},
			headers,
			wasConfigured: configured,
			usingSavedSecrets: configured,
			savedBaseline: configured ? {
				llmHosting: s.llmHosting,
				llmProvider: s.llmProvider,
				server: s.server || '',
				apiKey: s.apiKey || '',
				llmHeaders: s.llmHeaders && typeof s.llmHeaders === 'object' ? { ...s.llmHeaders } : {},
			} : null,
			testStatus: 'idle',
			testError: '',
			testModelCount: 0,
			pendingTestRequestId: '',
		};
	};

	fn.syncConnectionSummaryInPanel = function() {
		const summary = document.getElementById('general-settings-connection-summary');
		const connectBtn = document.getElementById('general-settings-connect-ia');
		if (!summary) {
			return;
		}
		const s = D.state.generalSettings || {};
		const text = s.connectionSummary
			|| (s.llmHosting && s.llmProvider
				? `${s.llmHosting === 'cloud' ? 'Cloud' : 'Self-hosted'} · ${fn.getConnectionProviderLabel(s.llmProvider)}`
				: 'Not configured');
		summary.textContent = text;
		if (connectBtn) {
			connectBtn.textContent = fn.isConnectionConfigured(s) ? 'Change connection' : 'Connect your AI';
		}
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	};

	function setWizardStep(step) {
		D.state.connectionWizard.step = step;
		D.state.connectionWizard.testStatus = 'idle';
		D.state.connectionWizard.testError = '';
	}

	function syncWizardActionButtons() {
		const wiz = D.state.connectionWizard;
		const step = wiz?.step ?? 1;
		const testing = wiz?.testStatus === 'testing';
		if (wizardBackBtn()) {
			wizardBackBtn().hidden = step <= 1;
			wizardBackBtn().disabled = testing;
		}
		if (wizardNextBtn()) {
			wizardNextBtn().hidden = step >= WIZARD_STEPS;
			const hasStepChoice = step === 1
				? wiz.hosting === 'cloud' || wiz.hosting === 'personal'
				: step === 2
					? Boolean(wiz.provider)
					: true;
			wizardNextBtn().disabled = testing || !hasStepChoice;
		}
		if (wizardFinishBtn()) {
			wizardFinishBtn().hidden = step < WIZARD_STEPS;
			wizardFinishBtn().disabled = testing;
			wizardFinishBtn().textContent = testing ? 'Testing…' : 'Test and save';
		}
		if (wizardResetBtn()) {
			const showReset = step === WIZARD_STEPS && (wiz.wasConfigured || fn.isConnectionConfigured());
			wizardResetBtn().hidden = !showReset;
			wizardResetBtn().disabled = testing;
		}
	}

	function renderTestStatus(wiz) {
		if (wiz.step !== WIZARD_STEPS) {
			return '';
		}
		if (wiz.testStatus === 'testing') {
			return '<p class="drox-wizard-test-status drox-wizard-test-pending">Connecting to server…</p>';
		}
		if (wiz.testStatus === 'ok') {
			const n = wiz.testModelCount || 0;
			return `<p class="drox-wizard-test-status drox-wizard-test-ok">Connection OK — ${n} model${n === 1 ? '' : 's'} detected.</p>`;
		}
		if (wiz.testStatus === 'error' && wiz.testError) {
			return `<p class="drox-wizard-test-status drox-wizard-test-error">${fn.escapeHtmlAttr(wiz.testError)}</p>`;
		}
		return '';
	}

	function savedSecretsHint(wiz) {
		if (!wiz.usingSavedSecrets || !wiz.wasConfigured || wiz.step !== WIZARD_STEPS) {
			return '';
		}
		if (wiz.hosting === 'cloud') {
			return '<p class="drox-wizard-hint">Secret fields empty: saved credentials will be used for the test.</p>';
		}
		return '';
	}

	function stepSelectionHint(wiz) {
		if (wiz.step === 1) {
			if (wiz.hosting === 'cloud' || wiz.hosting === 'personal') {
				return '<p class="drox-wizard-next-hint">Option selected — click <strong>Next</strong> to continue.</p>';
			}
			return '<p class="drox-wizard-next-hint drox-wizard-next-hint-muted">Select Cloud or Self-hosted, then click Next.</p>';
		}
		if (wiz.step === 2 && wiz.provider) {
			return '<p class="drox-wizard-next-hint">Provider selected — click <strong>Next</strong> to continue.</p>';
		}
		if (wiz.step === 2) {
			return '<p class="drox-wizard-next-hint drox-wizard-next-hint-muted">Choose a provider, then click Next.</p>';
		}
		return '';
	}

	fn.renderConnectionWizard = function() {
		const body = wizardBodyEl();
		const wiz = D.state.connectionWizard;
		if (!body || !wiz) {
			return;
		}
		const step = wiz.step;
		if (wizardStepLabelEl()) {
			wizardStepLabelEl().textContent = `Step ${step} / ${WIZARD_STEPS}`;
		}
		if (wizardTitleEl()) {
			wizardTitleEl().textContent = step === 1
				? 'Where does your AI run?'
				: step === 2
					? 'Choose a provider'
					: 'Connection setup';
		}
		syncWizardActionButtons();

		if (step === 1) {
			body.innerHTML = `
				<p class="drox-wizard-lead">Select how your model is hosted.</p>
				${stepSelectionHint(wiz)}
				<div class="drox-wizard-choice-grid" role="radiogroup" aria-label="Hosting">
					<button type="button" class="drox-wizard-hosting-card${wiz.hosting === 'cloud' ? ' selected' : ''}" data-hosting="cloud" aria-pressed="${wiz.hosting === 'cloud'}">
						<strong>Cloud</strong>
						<span>Managed provider (Hugging Face, Mistral, …)</span>
					</button>
					<button type="button" class="drox-wizard-hosting-card${wiz.hosting === 'personal' ? ' selected' : ''}" data-hosting="personal" aria-pressed="${wiz.hosting === 'personal'}">
						<strong>Self-hosted</strong>
						<span>Your own server (Ollama, vLLM, …)</span>
					</button>
				</div>`;
			for (const btn of body.querySelectorAll('.drox-wizard-hosting-card')) {
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					const hosting = btn.getAttribute('data-hosting');
					if (!hosting) {
						return;
					}
					wiz.hosting = hosting;
					if (wiz.provider) {
						const def = fn.findConnectionProviderDef(hosting, wiz.provider);
						if (!def) {
							wiz.provider = null;
						}
					}
					wiz.usingSavedSecrets = false;
					wiz.testStatus = 'idle';
					wiz.testError = '';
					fn.renderConnectionWizard();
				});
			}
			syncWizardActionButtons();
			return;
		}

		if (step === 2) {
			const providers = fn.getConnectionProvidersForHosting(wiz.hosting);
			const cards = providers.map(p => `
				<button type="button" class="drox-wizard-provider-card${wiz.provider === p.id ? ' selected' : ''}" data-provider="${p.id}" aria-pressed="${wiz.provider === p.id}">
					<strong>${p.label}</strong>
					<span>${p.description}</span>
				</button>`).join('');
			body.innerHTML = `
				<p class="drox-wizard-lead">${wiz.hosting === 'cloud' ? 'Cloud provider' : 'Self-hosted server'} — Drox engine compatible.</p>
				${stepSelectionHint(wiz)}
				<div class="drox-wizard-choice-grid drox-wizard-provider-grid" role="radiogroup" aria-label="Provider">${cards}</div>`;
			for (const btn of body.querySelectorAll('.drox-wizard-provider-card')) {
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					const provider = btn.getAttribute('data-provider');
					if (!provider) {
						return;
					}
					wiz.provider = provider;
					const def = fn.findConnectionProviderDef(wiz.hosting, provider);
					if (def && def.defaultServer && !wiz.server) {
						wiz.server = def.defaultServer;
					}
					wiz.testStatus = 'idle';
					wiz.testError = '';
					fn.renderConnectionWizard();
				});
			}
			syncWizardActionButtons();
			return;
		}

		const testBlock = renderTestStatus(wiz);
		const hintBlock = savedSecretsHint(wiz);

		if (wiz.hosting === 'cloud') {
			const def = fn.findConnectionProviderDef('cloud', wiz.provider);
			if (!def || !def.fields) {
				body.innerHTML = '<p class="drox-wizard-error">Unknown cloud provider.</p>';
				return;
			}
			const fieldsHtml = def.fields.map(field => {
				const val = wiz.formValues[field.id] ?? '';
				const inputType = field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text';
				const placeholder = field.placeholder || (field.type === 'password' && wiz.usingSavedSecrets ? '•••••• (unchanged)' : '');
				return `
					<label class="general-settings-field">
						<span>${field.label}${field.required ? ' *' : ''}</span>
						<input type="${inputType}" class="general-settings-input drox-wizard-field" data-field-id="${field.id}"
							placeholder="${fn.escapeHtmlAttr(placeholder)}" value="${fn.escapeHtmlAttr(val)}" autocomplete="off" />
					</label>`;
			}).join('');
			body.innerHTML = `
				${testBlock}
				<p class="drox-wizard-lead">${def.label} — test the connection before saving.</p>
				${hintBlock}
				${fieldsHtml}`;
			for (const input of body.querySelectorAll('.drox-wizard-field')) {
				input.addEventListener('input', () => {
					const id = input.getAttribute('data-field-id');
					if (id) {
						wiz.formValues[id] = input.value;
						if (input.value.trim()) {
							wiz.usingSavedSecrets = false;
						}
					}
					wiz.testStatus = 'idle';
					wiz.testError = '';
				});
			}
			return;
		}

		const headerRows = (wiz.headers || []).map((row, idx) => `
			<div class="drox-wizard-header-row" data-idx="${idx}">
				<input type="text" class="general-settings-input drox-wizard-header-name" placeholder="Name (e.g. x-api-key)" value="${fn.escapeHtmlAttr(row.name)}" spellcheck="false" />
				<input type="password" class="general-settings-input drox-wizard-header-value" placeholder="Value" value="${fn.escapeHtmlAttr(row.value)}" autocomplete="off" />
				<button type="button" class="icon-btn drox-wizard-header-remove" aria-label="Remove" title="Remove">×</button>
			</div>`).join('');
		body.innerHTML = `
			${testBlock}
			<p class="drox-wizard-lead">Your server URL — test before saving.</p>
			<label class="general-settings-field">
				<span>Server URL *</span>
				<input type="url" id="drox-wizard-personal-server" class="general-settings-input" spellcheck="false"
					placeholder="${fn.escapeHtmlAttr((fn.findConnectionProviderDef('personal', wiz.provider) || {}).defaultServer || 'http://127.0.0.1:11434')}"
					value="${fn.escapeHtmlAttr(wiz.server)}" />
			</label>
			<p class="general-settings-section-label">Custom headers</p>
			<div class="drox-wizard-headers">${headerRows}</div>
			<button type="button" id="drox-wizard-add-header" class="general-settings-panel-btn drox-wizard-add-header">+ Add header</button>`;

		const serverInput = document.getElementById('drox-wizard-personal-server');
		if (serverInput) {
			serverInput.addEventListener('input', () => {
				wiz.server = serverInput.value;
				wiz.testStatus = 'idle';
				wiz.testError = '';
			});
		}
		const syncHeaderRows = () => {
			wiz.headers = [];
			for (const row of body.querySelectorAll('.drox-wizard-header-row')) {
				const name = row.querySelector('.drox-wizard-header-name')?.value?.trim() || '';
				const value = row.querySelector('.drox-wizard-header-value')?.value || '';
				wiz.headers.push({ name, value });
			}
		};
		for (const row of body.querySelectorAll('.drox-wizard-header-row')) {
			for (const input of row.querySelectorAll('input')) {
				input.addEventListener('input', () => {
					syncHeaderRows();
					wiz.testStatus = 'idle';
					wiz.testError = '';
				});
			}
			const remove = row.querySelector('.drox-wizard-header-remove');
			if (remove) {
				remove.addEventListener('click', () => {
					syncHeaderRows();
					const idx = Number(row.getAttribute('data-idx'));
					wiz.headers.splice(idx, 1);
					if (wiz.headers.length === 0) {
						wiz.headers.push(emptyHeadersRow());
					}
					fn.renderConnectionWizard();
				});
			}
		}
		const addBtn = document.getElementById('drox-wizard-add-header');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				syncHeaderRows();
				wiz.headers.push(emptyHeadersRow());
				fn.renderConnectionWizard();
			});
		}
	};

	fn.escapeHtmlAttr = function(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	};

	fn.validateConnectionWizardStep = function() {
		const wiz = D.state.connectionWizard;
		if (!wiz) {
			return 'Wizard unavailable.';
		}
		if (wiz.step === 1) {
			return wiz.hosting === 'cloud' || wiz.hosting === 'personal' ? '' : 'Choose cloud or self-hosted.';
		}
		if (wiz.step === 2) {
			return wiz.provider ? '' : 'Choose a provider.';
		}
		if (wiz.hosting === 'cloud') {
			const def = fn.findConnectionProviderDef('cloud', wiz.provider);
			if (!def || !def.fields) {
				return 'Invalid provider.';
			}
			for (const field of def.fields) {
				const val = String(wiz.formValues[field.id] ?? '').trim();
				if (field.required && !val && !(wiz.usingSavedSecrets && wiz.savedBaseline)) {
					return `${field.label} is required.`;
				}
			}
			const patch = fn.buildConnectionPatchFromWizard();
			if (!String(patch.server || '').trim()) {
				return 'Server URL is required.';
			}
			return '';
		}
		const server = String(wiz.server ?? '').trim();
		if (!server) {
			return 'Server URL is required.';
		}
		return '';
	};

	fn.buildConnectionPatchFromWizard = function() {
		const wiz = D.state.connectionWizard;
		const patch = {
			llmHosting: wiz.hosting,
			llmProvider: wiz.provider,
			server: '',
			apiKey: '',
			llmHeaders: {},
		};
		if (wiz.hosting === 'cloud') {
			const def = fn.findConnectionProviderDef('cloud', wiz.provider);
			patch.server = def?.defaultServer || '';
			if (def?.fields) {
				for (const field of def.fields) {
					const raw = String(wiz.formValues[field.id] ?? '').trim();
					if (!raw) {
						continue;
					}
					if (field.mapsToServer) {
						patch.server = raw;
					} else if (field.mapsToApiKey) {
						patch.apiKey = raw;
					} else if (field.mapsToHeader) {
						const prefix = field.headerPrefix || '';
						patch.llmHeaders[field.mapsToHeader] = `${prefix}${raw}`;
					}
				}
			}
		} else {
			patch.server = String(wiz.server ?? '').trim();
			patch.apiKey = String(wiz.apiKey ?? '').trim();
			const headers = {};
			for (const row of wiz.headers || []) {
				const name = String(row.name ?? '').trim();
				const value = String(row.value ?? '').trim();
				if (name && value) {
					headers[name] = value;
				}
			}
			patch.llmHeaders = headers;
		}
		if (wiz.usingSavedSecrets && wiz.savedBaseline) {
			const base = wiz.savedBaseline;
			if (!patch.apiKey && base.apiKey) {
				patch.apiKey = base.apiKey;
			}
			patch.llmHeaders = { ...base.llmHeaders, ...patch.llmHeaders };
			if (!patch.server && base.server) {
				patch.server = base.server;
			}
		}
		return patch;
	};

	fn.openConnectionWizard = function() {
		if (D.state.busy) {
			return;
		}
		const configured = fn.isConnectionConfigured(D.state.generalSettings);
		fn.connectionWizardResetDraft(D.state.generalSettings, { step: configured ? WIZARD_STEPS : 1 });
		D.state.connectionWizard.open = true;
		const el = wizardEl();
		if (el) {
			el.hidden = false;
		}
		fn.renderConnectionWizard();
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	};

	fn.closeConnectionWizard = function() {
		if (D.state.connectionWizard) {
			D.state.connectionWizard.open = false;
			D.state.connectionWizard.testStatus = 'idle';
			D.state.connectionWizard.pendingTestRequestId = '';
		}
		const el = wizardEl();
		if (el) {
			el.hidden = true;
		}
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	};

	fn.persistConnectionWizard = function() {
		const err = fn.validateConnectionWizardStep();
		if (err) {
			const wiz = D.state.connectionWizard;
			wiz.testStatus = 'error';
			wiz.testError = err;
			fn.renderConnectionWizard();
			return;
		}
		const wiz = D.state.connectionWizard;
		const patch = fn.buildConnectionPatchFromWizard();
		const requestId = `conn-test-${++testRequestCounter}`;
		wiz.pendingTestRequestId = requestId;
		wiz.testStatus = 'testing';
		wiz.testError = '';
		fn.renderConnectionWizard();
		D.vscode.postMessage({ type: 'testLlmConnection', requestId, settings: patch });
	};

	fn.showConnectionWizardError = function(message) {
		const body = wizardBodyEl();
		if (!body) {
			return;
		}
		let note = body.querySelector('.drox-wizard-error');
		if (!note) {
			note = document.createElement('p');
			note.className = 'drox-wizard-error';
			body.prepend(note);
		}
		note.textContent = message;
	};

	fn.handleConnectionTestResult = function(payload) {
		const wiz = D.state.connectionWizard;
		if (!wiz || !wiz.open || payload.requestId !== wiz.pendingTestRequestId) {
			return;
		}
		wiz.pendingTestRequestId = '';
		if (payload.ok) {
			wiz.testStatus = 'ok';
			wiz.testModelCount = payload.modelCount || 0;
			wiz.testError = '';
			const patch = fn.buildConnectionPatchFromWizard();
			D.state.generalSettings = { ...D.state.generalSettings, ...patch };
			fn.syncConnectionSummaryInPanel();
			fn.syncGeneralSettingsVignetteHint();
			D.vscode.postMessage({ type: 'setGeneralSettings', settings: patch });
			D.vscode.postMessage({ type: 'refreshLlmModels' });
			fn.renderConnectionWizard();
			window.setTimeout(() => fn.closeConnectionWizard(), 700);
			return;
		}
		wiz.testStatus = 'error';
		wiz.testError = payload.error || 'Connection test failed.';
		fn.renderConnectionWizard();
	};

	fn.requestConnectionReset = function() {
		if (D.state.busy) {
			return;
		}
		D.vscode.postMessage({ type: 'resetLlmConnection' });
	};

	fn.handleConnectionResetResult = function(payload) {
		if (!payload?.ok) {
			return;
		}
		fn.connectionWizardResetDraft({
			llmHosting: '',
			llmProvider: 'ollama',
			server: '',
			apiKey: '',
			llmHeaders: {},
		}, { step: 1 });
		D.state.connectionWizard.wasConfigured = false;
		D.state.connectionWizard.usingSavedSecrets = false;
		D.state.connectionWizard.savedBaseline = null;
		if (D.state.connectionWizard.open) {
			fn.renderConnectionWizard();
		}
		fn.syncConnectionSummaryInPanel();
	};

	fn.connectionWizardBack = function() {
		const wiz = D.state.connectionWizard;
		if (!wiz || wiz.step <= 1 || wiz.testStatus === 'testing') {
			return;
		}
		setWizardStep(wiz.step - 1);
		fn.renderConnectionWizard();
	};

	fn.connectionWizardNext = function() {
		const err = fn.validateConnectionWizardStep();
		if (err) {
			const wiz = D.state.connectionWizard;
			wiz.testStatus = 'error';
			wiz.testError = err;
			fn.renderConnectionWizard();
			return;
		}
		const wiz = D.state.connectionWizard;
		if (wiz.step >= WIZARD_STEPS || wiz.testStatus === 'testing') {
			return;
		}
		setWizardStep(wiz.step + 1);
		fn.renderConnectionWizard();
	};

	fn.initConnectionWizard = function() {
		if (D.state._connectionWizardInit) {
			return;
		}
		D.state._connectionWizardInit = true;
		fn.connectionWizardResetDraft();
		const connectBtn = document.getElementById('general-settings-connect-ia');
		if (connectBtn) {
			connectBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				fn.openConnectionWizard();
			});
		}
		const back = wizardBackBtn();
		if (back) {
			back.addEventListener('click', () => fn.connectionWizardBack());
		}
		const next = wizardNextBtn();
		if (next) {
			next.addEventListener('click', () => fn.connectionWizardNext());
		}
		const finish = wizardFinishBtn();
		if (finish) {
			finish.addEventListener('click', () => fn.persistConnectionWizard());
		}
		const reset = wizardResetBtn();
		if (reset) {
			reset.addEventListener('click', () => fn.requestConnectionReset());
		}
		const cancel = document.getElementById('drox-connection-wizard-cancel');
		if (cancel) {
			cancel.addEventListener('click', () => fn.closeConnectionWizard());
		}
		const backdrop = document.querySelector('.drox-connection-wizard-backdrop');
		if (backdrop) {
			backdrop.addEventListener('click', (e) => {
				e.stopPropagation();
				fn.closeConnectionWizard();
			});
		}
		const wizardRoot = wizardEl();
		if (wizardRoot) {
			wizardRoot.addEventListener('click', (e) => {
				if (e.target === backdrop) {
					return;
				}
				e.stopPropagation();
			});
		}
		fn.syncConnectionSummaryInPanel();
	};
})(globalThis.DroxChat);
