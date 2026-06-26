/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	/** Fin de run — conserve l'ordre #log (pas de reparent strip). */
	fn.finalizeRunPresentation = function () {
		if (D.state.chatStreamEl?.isConnected) {
			D.state.chatStreamEl.classList.remove('streaming');
			D.state.chatStreamEl.classList.add('drox-final-answer');
			fn.markTurnFinalAssistant?.(D.state.chatStreamEl);
		}
		D.state.assistantEl = null;
	};

	fn.removeReplayLayoutOrphans = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		for (const el of log.querySelectorAll(':scope > .activity-warmup')) {
			el.remove();
		}
	};

	fn.expandAllCollapsibleInLog = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		for (const details of log.querySelectorAll('details')) {
			details.open = true;
		}
		for (const tray of log.querySelectorAll('.drox-collapsible-tray-inner')) {
			if (typeof fn.expandCollapsibleTrayInner === 'function') {
				fn.expandCollapsibleTrayInner(tray);
			}
		}
		fn.enhanceDisclosuresUnder?.(log);
	};

	/** Fin rejeu / prepend historique — remettre le fil dans un état scrollable unique. */
	fn.finalizeReplayThreadUi = function (opts) {
		fn.ensureLogScrollReady?.();
		fn.removeReplayLayoutOrphans?.();
		fn.hideActivity?.();
		if (!opts?.flat) {
			fn.promoteChatStreamToFinalAnswer?.();
			fn.parkAllLinearFinalAnswers?.();
			fn.sealAllOpenRunStrips?.();
			fn.endLinearRunStrip?.({ force: true });
		}
		fn.releasePlanStickyFooter?.();
		fn.hidePlanActivitySticky?.();
		fn.clearLastUserStickyRow?.();
		document.body.classList.remove('drox-linear-run-active');
		D.state.linearRunUi = false;
		D.state.runStripEl = null;
		D.state.runStripAnchorEl = null;
		D.state.runStripCommitted = false;
		fn.expandAllCollapsibleInLog?.();
		fn.nudgeLogScrollLayout?.();
		if (opts?.scrollToEnd === true) {
			requestAnimationFrame(() => {
				fn.pinLogToBottom?.();
				fn.nudgeLogScrollLayout?.();
			});
		} else if (opts?.scrollToEnd === false) {
			requestAnimationFrame(() => {
				if (D.dom.logEl) {
					D.dom.logEl.scrollTop = 0;
				}
				fn.nudgeLogScrollLayout?.();
			});
		}
	};

	/** Fin rejeu session — appelé par `sessionReplayDone`. */
	fn.finalizeSessionReplayUi = function (opts) {
		const scrollToEnd = opts?.scrollToEnd !== false;
		if (typeof fn.endHistoryReplay === 'function') {
			fn.endHistoryReplay({ scrollToEnd });
			return;
		}
		fn.finalizeReplayThreadUi({ scrollToEnd });
		D.state.uiReplayActive = false;
		D.state.sessionHistoryLoading = false;
		fn.setBusy(false);
	};
})(globalThis.DroxChat);
