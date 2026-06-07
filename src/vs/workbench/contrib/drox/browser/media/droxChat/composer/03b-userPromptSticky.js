/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Dernier message utilisateur — bandeau sticky (un seul visible). */

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
		fn.renderUserPromptSticky();
	};

	fn.linkUserPromptStickyToMessage = function (messageId) {
		if (!D.state.userPromptStickySnapshot || !messageId) {
			return;
		}
		D.state.userPromptStickySnapshot.messageId = messageId;
		D.state.userPromptStickyPendingLink = false;
		fn.renderUserPromptSticky();
	};

	fn.renderUserPromptSticky = function () {
		if (!D.dom.stickyUserPromptEl || !D.state.userPromptStickySnapshot) {
			return;
		}
		const { text, meta, fullText } = D.state.userPromptStickySnapshot;
		D.dom.stickyUserPromptEl.replaceChildren();
		D.dom.stickyUserPromptEl.title = fullText || text;

		const ic = document.createElement('span');
		ic.className = 'sticky-ic';
		ic.textContent = '▸';
		ic.setAttribute('aria-hidden', 'true');

		const body = document.createElement('div');
		body.className = 'sticky-body';

		const txt = document.createElement('span');
		txt.className = 'sticky-text';
		txt.textContent = text;
		body.appendChild(txt);

		if (meta) {
			const metaEl = document.createElement('span');
			metaEl.className = 'sticky-meta';
			metaEl.textContent = meta;
			body.appendChild(metaEl);
		}

		const jump = document.createElement('span');
		jump.className = 'sticky-jump';
		jump.textContent = '↗';
		jump.title = 'Voir dans le fil';

		D.dom.stickyUserPromptEl.appendChild(ic);
		D.dom.stickyUserPromptEl.appendChild(body);
		D.dom.stickyUserPromptEl.appendChild(jump);
		D.dom.stickyUserPromptEl.hidden = false;
	};

	fn.hideUserPromptSticky = function () {
		if (!D.dom.stickyUserPromptEl) {
			return;
		}
		D.dom.stickyUserPromptEl.hidden = true;
		D.dom.stickyUserPromptEl.replaceChildren();
		D.dom.stickyUserPromptEl.removeAttribute('title');
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
