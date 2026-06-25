/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;
	const SCROLL_TOP_THRESHOLD_PX = 80;
	const DEBOUNCE_MS = 300;
	let debounceTimer = null;

	fn.mergePrependFragment = function () {
		const log = D.dom.logEl;
		const fragment = D.state._prependFragment;
		if (log && fragment && fragment.childNodes.length > 0) {
			log.insertBefore(fragment, log.firstChild);
		}
		D.state._prependFragment = null;
		D.state.sessionHistoryPrependActive = false;
	};

	/** Garantit que tout le fil est dans #log (pas de buffer prepend / patch appendChild). */
	fn.ensureLogScrollReady = function () {
		fn.mergePrependFragment();
	};

	/** Point d'entrée unique pour les nœuds racine du fil. */
	fn.appendToLog = function (node) {
		const log = D.dom.logEl;
		if (!log || !node) {
			return node;
		}
		const fragment = D.state._prependFragment;
		if (D.state.sessionHistoryPrependActive && fragment) {
			fragment.appendChild(node);
			return node;
		}
		log.appendChild(node);
		return node;
	};

	fn.resetSessionLazyHistory = function () {
		D.state._prependFragment = null;
		D.state.sessionHistoryPrependActive = false;
		D.state.sessionHistoryHasOlder = false;
		D.state.sessionHistoryOldestIndex = 0;
		D.state.sessionHistoryLoading = false;
		D.state._prependScrollHeight = 0;
		D.state._prependScrollTop = 0;
	};

	fn.applySessionHistoryMeta = function (m) {
		D.state.sessionHistoryHasOlder = Boolean(m.hasOlder);
		D.state.sessionHistoryOldestIndex =
			typeof m.oldestLoadedIndex === 'number' && Number.isFinite(m.oldestLoadedIndex)
				? Math.max(0, Math.floor(m.oldestLoadedIndex))
				: 0;
	};

	fn.beginSessionHistoryPrepend = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		fn.mergePrependFragment();
		D.state.sessionHistoryPrependActive = true;
		D.state.uiReplayActive = true;
		D.state._prependScrollHeight = log.scrollHeight;
		D.state._prependScrollTop = log.scrollTop;
		D.state._prependFragment = document.createDocumentFragment();
		if (typeof fn.beginLinearRunStrip === 'function') {
			fn.beginLinearRunStrip();
		}
	};

	fn.finishSessionHistoryPrepend = function () {
		const log = D.dom.logEl;
		const hadPrepend = Boolean(D.state.sessionHistoryPrependActive && log);
		if (hadPrepend) {
			fn.mergePrependFragment();
			const prevHeight = D.state._prependScrollHeight || 0;
			const prevTop = D.state._prependScrollTop || 0;
			D.state.uiReplayActive = false;
			requestAnimationFrame(() => {
				const newHeight = log.scrollHeight;
				log.scrollTop = prevTop + (newHeight - prevHeight);
				D.state.logStickToBottom = fn.isLogNearBottom(log);
				D.state.sessionHistoryLoading = false;
				fn.finalizeReplayThreadUi?.();
				fn.nudgeLogScrollLayout?.();
			});
			return;
		}
		D.state.sessionHistoryLoading = false;
	};

	fn.nudgeLogScrollLayout = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		const top = log.scrollTop;
		log.style.overflowY = 'hidden';
		void log.offsetHeight;
		log.style.overflowY = '';
		log.scrollTop = top;
	};

	fn.maybeLoadOlderSessionHistory = function () {
		if (D.state.busy) {
			return;
		}
		if (D.state.uiReplayActive && !D.state.sessionHistoryPrependActive) {
			return;
		}
		if (!D.state.sessionHistoryHasOlder || D.state.sessionHistoryLoading) {
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
		fn.ensureLogScrollReady();
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
