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

	/** Fin rejeu session — appelé par `sessionReplayDone`. */
	fn.finalizeSessionReplayUi = function () {
		fn.promoteChatStreamToFinalAnswer?.();
		fn.parkAllLinearFinalAnswers?.();
		fn.sealAllOpenRunStrips?.();
		fn.scrollLog?.(true);
	};
})(globalThis.DroxChat);
