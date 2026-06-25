/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	/** Fin de run : ranger les réponses dans le strip du tour. */
	fn.finalizeRunPresentation = function () {
		const preserveDiscussion =
			typeof fn.shouldPreserveDiscussionStripOnBusyEnd === 'function' &&
			fn.shouldPreserveDiscussionStripOnBusyEnd();
		if (
			!preserveDiscussion &&
			!D.state.discussionAwaitingCanonicalReply &&
			D.state.runStripEl?.isConnected &&
			typeof fn.normalizeLinearThinkingLayout === 'function'
		) {
			fn.normalizeLinearThinkingLayout(D.state.runStripEl);
		}
		fn.promoteChatStreamToFinalAnswer?.();
		fn.parkAllLinearFinalAnswers?.();
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

	/** Fin rejeu / prepend historique — remettre le fil dans un état scrollable unique. */
	fn.finalizeReplayThreadUi = function (opts) {
		fn.ensureLogScrollReady?.();
		fn.removeReplayLayoutOrphans?.();
		fn.promoteChatStreamToFinalAnswer?.();
		fn.parkAllLinearFinalAnswers?.();
		fn.sealAllOpenRunStrips?.();
		fn.releasePlanStickyFooter?.();
		fn.endLinearRunStrip?.({ force: true });
		fn.hidePlanActivitySticky?.();
		fn.clearLastUserStickyRow?.();
		document.body.classList.remove('drox-linear-run-active');
		D.state.linearRunUi = false;
		fn.nudgeLogScrollLayout?.();
		if (opts?.scrollToEnd) {
			requestAnimationFrame(() => {
				fn.scrollLogToEnd?.();
				fn.nudgeLogScrollLayout?.();
			});
		}
	};

	/** Fin rejeu session — appelé par `sessionReplayDone`. */
	fn.finalizeSessionReplayUi = function () {
		fn.finalizeReplayThreadUi({ scrollToEnd: true });
		D.state.uiReplayActive = false;
		fn.setBusy(false);
	};
})(globalThis.DroxChat);
