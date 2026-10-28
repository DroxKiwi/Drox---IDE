/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	function hostingOf(raw) {
		const value = raw?.hosting || raw?.llmHosting;
		return value === 'cloud' ? 'cloud' : 'personal';
	}

	function providerOf(raw) {
		return String(raw?.provider || raw?.llmProvider || 'ollama').trim() || 'ollama';
	}

	fn.savedLlmConnectionKey = function (connection) {
		return `${hostingOf(connection)}|${providerOf(connection)}|${String(connection?.server || '').trim()}`;
	};

	function toSavedConnection(raw) {
		const server = String(raw?.server || '').trim();
		if (!server) {
			return null;
		}
		const headers = {};
		const source = raw.llmHeaders && typeof raw.llmHeaders === 'object' ? raw.llmHeaders : {};
		for (const [name, value] of Object.entries(source)) {
			const headerName = String(name).trim();
			if (headerName) {
				headers[headerName] = String(value ?? '').trim();
			}
		}
		return {
			hosting: hostingOf(raw),
			provider: providerOf(raw),
			server,
			apiKey: String(raw.apiKey || '').trim(),
			llmHeaders: headers,
		};
	}

	fn.listSavedLlmConnections = function (settings) {
		const s = settings || D.state.generalSettings || {};
		const list = [];
		const seen = new Set();
		const push = item => {
			const parsed = toSavedConnection(item);
			if (!parsed) {
				return;
			}
			const key = fn.savedLlmConnectionKey(parsed);
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			list.push(parsed);
		};
		const stored = Array.isArray(s.savedConnections) ? s.savedConnections : [];
		for (const item of stored) {
			push(item);
		}
		if (fn.isConnectionConfigured?.(s)) {
			push(s);
		}
		return list;
	};

	fn.beginSavedConnectionProbes = function () {
		const saved = fn.listSavedLlmConnections();
		const activeKey = fn.savedLlmConnectionKey(D.state.generalSettings || {});
		D.state.savedConnectionProbes = {};
		const pending = [];
		for (const item of saved) {
			const key = fn.savedLlmConnectionKey(item);
			if (key === activeKey) {
				D.state.savedConnectionProbes[key] = 'active';
				continue;
			}
			D.state.savedConnectionProbes[key] = 'pending';
			pending.push({
				key,
				settings: {
					llmHosting: item.hosting,
					llmProvider: item.provider,
					server: item.server,
					apiKey: item.apiKey,
					llmHeaders: item.llmHeaders,
				},
			});
		}
		if (pending.length > 0) {
			D.vscode.postMessage({ type: 'probeSavedLlmConnections', connections: pending });
		}
	};

	fn.handleSavedConnectionProbe = function (payload) {
		const requestId = String(payload?.requestId || '');
		const key = requestId.startsWith('saved-probe:') ? requestId.slice('saved-probe:'.length) : '';
		if (!key || !D.state.savedConnectionProbes) {
			return;
		}
		D.state.savedConnectionProbes[key] = payload.ok ? 'ok' : 'down';
		if (D.state.connectionWizard?.open && D.state.connectionWizard.step === 1 && typeof fn.renderConnectionWizard === 'function') {
			fn.renderConnectionWizard();
		}
	};

	fn.removeSavedLlmConnection = function (key) {
		const activeKey = fn.savedLlmConnectionKey(D.state.generalSettings || {});
		const removingActive = key === activeKey;
		const saved = fn.listSavedLlmConnections().filter(item => fn.savedLlmConnectionKey(item) !== key);
		if (removingActive && D.state.generalSettings) {
			D.state.generalSettings = {
				...D.state.generalSettings,
				llmHosting: '',
				llmProvider: '',
				server: '',
				apiKey: '',
				llmHeaders: {},
				savedConnections: saved,
				connectionSummary: 'Not configured',
			};
		} else if (D.state.generalSettings) {
			D.state.generalSettings.savedConnections = saved;
		}
		if (D.state.savedConnectionProbes) {
			delete D.state.savedConnectionProbes[key];
		}
		const settings = { savedConnections: saved, replaceSavedConnections: true };
		if (removingActive) {
			settings.llmHosting = '';
			settings.llmProvider = '';
			settings.server = '';
			settings.apiKey = '';
			settings.llmHeaders = {};
		}
		D.vscode.postMessage({ type: 'setGeneralSettings', settings });
		if (removingActive) {
			D.vscode.postMessage({ type: 'refreshLlmModels' });
		}
		if (typeof fn.syncConnectionSummaryInPanel === 'function') {
			fn.syncConnectionSummaryInPanel();
		}
		if (typeof fn.renderConnectionWizard === 'function') {
			fn.renderConnectionWizard();
		}
	};

	fn.savedLlmConnectionLabel = function (connection) {
		const hosting = hostingOf(connection);
		const providers = typeof fn.getConnectionProvidersForHosting === 'function'
			? fn.getConnectionProvidersForHosting(hosting)
			: [];
		const providerId = providerOf(connection);
		const def = providers.find(item => item.id === providerId);
		const provider = def?.label || providerId;
		const server = String(connection.server || '').replace(/^https?:\/\//, '');
		return `${hosting === 'cloud' ? 'Cloud' : 'Self-hosted'} · ${provider} · ${server}`;
	};
})(globalThis.DroxChat);
