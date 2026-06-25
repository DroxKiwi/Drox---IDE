/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Dernier prompt user — état pour liaison messageId (bandeau chrome masqué en CSS). */

(function (D) {
	const fn = D.fn;

	/** @type {{ text: string, meta?: string, fullText: string, messageId?: string } | null} */
	D.state.userPromptStickySnapshot = null;
	D.state.userPromptStickyPendingLink = false;

	fn.setUserPromptSticky = function (payload) {
		const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
		if (!text) {
			fn.hideUserPromptSticky();
			return;
		}
		D.state.userPromptStickySnapshot = {
			text,
			meta:
				typeof payload.meta === 'string' && payload.meta.trim()
					? payload.meta.trim()
					: undefined,
			fullText:
				typeof payload.fullText === 'string' && payload.fullText.trim()
					? payload.fullText.trim()
					: text,
			messageId: D.state.userPromptStickySnapshot?.messageId,
		};
		D.state.userPromptStickyPendingLink = true;
	};

	fn.linkUserPromptStickyToMessage = function (messageId) {
		if (!D.state.userPromptStickySnapshot || !messageId) {
			return;
		}
		D.state.userPromptStickySnapshot.messageId = messageId;
		D.state.userPromptStickyPendingLink = false;
	};

	fn.hideUserPromptSticky = function () {
		D.state.userPromptStickySnapshot = null;
		D.state.userPromptStickyPendingLink = false;
	};

	fn.flashUserMessageRow = function (row) {
		row.classList.add('msg-row-highlight');
		window.setTimeout(() => {
			row.classList.remove('msg-row-highlight');
		}, 1800);
	};

	fn.scrollToUserPromptMessage = function () {
		const id = D.state.userPromptStickySnapshot?.messageId;
		if (!id || !D.dom.logEl) {
			return;
		}
		const row = D.dom.logEl.querySelector(
			`.msg-row-user[data-msg-id="${CSS.escape(id)}"]`,
		);
		if (!(row instanceof HTMLDivElement)) {
			return;
		}
		row.scrollIntoView({ block: 'center', behavior: 'smooth' });
		fn.flashUserMessageRow(row);
	};
})(globalThis.DroxChat);
