/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pagination historique : l'hôte recharge tout le fil (pas de prepend DOM).

(function (D) {
	const fn = D.fn;
	const SCROLL_TOP_THRESHOLD_PX = 80;
	const DEBOUNCE_MS = 300;
	let debounceTimer = null;

	fn.resetSessionLazyHistory = function () {
		D.state.sessionHistoryHasOlder = false;
		D.state.sessionHistoryOldestIndex = 0;
		D.state.sessionHistoryLoading = false;
	};

	fn.applySessionHistoryMeta = function (m) {
		D.state.sessionHistoryHasOlder = Boolean(m.hasOlder);
		D.state.sessionHistoryOldestIndex =
			typeof m.oldestLoadedIndex === 'number' && Number.isFinite(m.oldestLoadedIndex)
				? Math.max(0, Math.floor(m.oldestLoadedIndex))
				: 0;
	};

	fn.nudgeLogScrollLayout = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		void log.scrollHeight;
	};

	fn.maybeLoadOlderSessionHistory = function () {
		if (D.state.busy || D.state.uiReplayActive || D.state.sessionHistoryLoading) {
			return;
		}
		if (!D.state.sessionHistoryHasOlder) {
			return;
		}
		const sessionId = D.state.currentSessionId;
		if (typeof sessionId !== 'string' || !sessionId.startsWith('ses_')) {
			return;
		}
		const log = D.dom.logEl;
		if (!log || log.scrollTop > SCROLL_TOP_THRESHOLD_PX) {
			return;
		}
		const beforeIndex = D.state.sessionHistoryOldestIndex;
		if (!beforeIndex || beforeIndex <= 0) {
			return;
		}
		D.state.sessionHistoryLoading = true;
		D.vscode.postMessage({
			type: 'loadSessionOlder',
			sessionId,
			beforeIndex,
		});
	};

	fn.initSessionLazyHistory = function () {
		if (!D.dom.logEl || D.dom.logEl.dataset.lazyHistoryBound === '1') {
			return;
		}
		D.dom.logEl.dataset.lazyHistoryBound = '1';
		D.dom.logEl.addEventListener(
			'scroll',
			() => {
				if (debounceTimer) {
					clearTimeout(debounceTimer);
				}
				debounceTimer = setTimeout(() => {
					debounceTimer = null;
					fn.maybeLoadOlderSessionHistory();
				}, DEBOUNCE_MS);
			},
			{ passive: true },
		);
	};
})(globalThis.DroxChat);
