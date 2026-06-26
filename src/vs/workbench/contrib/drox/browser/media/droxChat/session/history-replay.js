/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fil unique #log — ordre strict d'arrivée (live + historique). Pas de strip / tray.

(function (D) {
	const fn = D.fn;

	fn.isHistoryReplay = function () {
		return Boolean(D.state.uiReplayActive);
	};

	fn.resetLinearTurnAnchors = function () {
		D.state._historyStreamEl = null;
		D.state._turnFinalAssistantEl = null;
	};

	/** Point d'entrée unique pour les nœuds racine du fil. */
	fn.appendToLog = function (node) {
		const log = D.dom.logEl;
		if (!log || !node) {
			return node;
		}
		log.appendChild(node);
		return node;
	};

	/** Outils / diffs : avant le stream du tour en cours uniquement (pas une réponse passée). */
	fn.getLinearInsertBefore = function () {
		const log = D.dom.logEl;
		if (!log) {
			return null;
		}
		const stream = D.state._historyStreamEl;
		if (stream?.isConnected && stream.parentElement === log) {
			return stream;
		}
		const chatStream = D.state.chatStreamEl;
		if (chatStream?.isConnected && chatStream.parentElement === log) {
			return chatStream;
		}
		return null;
	};

	fn.mountLinearLogNode = function (node) {
		const log = D.dom.logEl;
		if (!log || !node) {
			return node;
		}
		const before = fn.getLinearInsertBefore();
		if (before) {
			log.insertBefore(node, before);
		} else {
			log.appendChild(node);
		}
		return node;
	};

	fn.markTurnFinalAssistant = function (el) {
		if (el?.isConnected) {
			D.state._turnFinalAssistantEl = el;
		}
	};

	fn.ensureLogScrollReady = function () {
		// Tout vit dans #log.
	};

	fn.beginHistoryReplay = function () {
		D.state.uiReplayActive = true;
		fn.resetLinearTurnAnchors();
	};

	fn.resetHistoryReplayStream = function () {
		const el = D.state._historyStreamEl;
		if (el?.isConnected && !String(el.dataset.raw || '').trim()) {
			el.remove();
		}
		D.state._historyStreamEl = null;
	};

	fn.endHistoryReplay = function (opts) {
		fn.resetHistoryReplayStream();
		D.state.uiReplayActive = false;
		D.state.sessionHistoryLoading = false;
		fn.finalizeReplayThreadUi?.({ ...opts, flat: true });
		fn.setBusy(false);
	};

	/** Delta journal UI → bloc stream dans #log (outils peuvent s'insérer avant). */
	fn.historyReplayDelta = function (text) {
		const chunk = typeof fn.sanitizeChatDeltaChunk === 'function' ? fn.sanitizeChatDeltaChunk(text) : String(text || '');
		if (!chunk) {
			return;
		}
		let el = D.state._historyStreamEl;
		if (!el?.isConnected) {
			el = document.createElement('div');
			el.className = 'msg assistant msg-ai-frame markdown drox-chat-stream';
			el.dataset.raw = '';
			fn.appendToLog(el);
			D.state._historyStreamEl = el;
		}
		const nextRaw = (el.dataset.raw || '') + chunk;
		el.dataset.raw = nextRaw;
		if (typeof fn.paintAssistantMarkdown === 'function') {
			fn.paintAssistantMarkdown(el, nextRaw, { streaming: false });
		} else {
			el.textContent = nextRaw;
		}
	};

	/** Réponse canonique journal UI. */
	fn.historyReplayUserFacingReply = function (text) {
		fn.resetHistoryReplayStream();
		const reply =
			typeof fn.extractAnsweringOnlyText === 'function' ? fn.extractAnsweringOnlyText(text) : String(text || '');
		if (!reply?.trim() || (typeof fn.looksLikeGateJson === 'function' && fn.looksLikeGateJson(reply))) {
			return;
		}
		const stream = D.state._historyStreamEl;
		if (stream?.isConnected && String(stream.dataset.raw || '').trim()) {
			stream.classList.remove('streaming');
			stream.classList.add('drox-final-answer', 'drox-user-facing-reply');
			fn.paintAssistantMarkdown(stream, reply, { streaming: false });
			fn.markTurnFinalAssistant(stream);
			D.state._historyStreamEl = null;
			return;
		}
		const el = fn.appendMessage('assistant', reply);
		if (el) {
			el.classList.add('drox-final-answer', 'drox-user-facing-reply');
			fn.markTurnFinalAssistant(el);
		}
	};
})(globalThis.DroxChat);
