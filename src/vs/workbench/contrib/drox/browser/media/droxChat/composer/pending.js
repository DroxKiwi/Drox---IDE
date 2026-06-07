/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.snippetForPending = function(text, maxLen) {
		const one = String(text || '').replace(/\s+/g, ' ').trim();
		if (!one) {
			return '(empty)';
		}
		if (one.length <= maxLen) {
			return one;
		}
		return one.slice(0, maxLen) + '…';
	}

	fn.renderPendingPrompts = function() {
		if (!D.dom.pendingPromptsEl) {
			return;
		}
		D.dom.pendingPromptsEl.replaceChildren();
		if (D.state.pendingPrompts.length === 0) {
			D.dom.pendingPromptsEl.hidden = true;
			return;
		}
		D.dom.pendingPromptsEl.hidden = false;

		const list = document.createElement('div');
		list.className = 'pending-prompts-list';
		list.setAttribute('aria-label', `${D.state.pendingPrompts.length} queued message(s)`);

		for (const item of D.state.pendingPrompts) {
			const card = document.createElement('div');
			card.className = 'pending-prompt-card';

			const body = document.createElement('div');
			body.className = 'pending-prompt-body';
			const text = document.createElement('span');
			text.className = 'pending-prompt-snippet';
			text.textContent = fn.snippetForPending(item.prompt, D.const.PENDING_SNIPPET_MAX);
			text.title = item.prompt || '';
			body.appendChild(text);

			if (item.attachments && item.attachments.length > 0) {
				const meta = document.createElement('span');
				meta.className = 'pending-prompt-meta';
				meta.textContent = `${item.attachments.length} img`;
				body.appendChild(meta);
			}
			if (item.references && item.references.length > 0) {
				const meta = document.createElement('span');
				meta.className = 'pending-prompt-meta';
				meta.textContent = `${item.references.length} ref.`;
				body.appendChild(meta);
			}
			if (item.pastes && item.pastes.length > 0) {
				const meta = document.createElement('span');
				meta.className = 'pending-prompt-meta';
				meta.textContent = `${item.pastes.length} snippet(s)`;
				body.appendChild(meta);
			}

			const actions = document.createElement('div');
			actions.className = 'pending-prompt-actions';

			const editBtn = document.createElement('button');
			editBtn.type = 'button';
			editBtn.className = 'pending-prompt-edit';
			editBtn.textContent = 'Edit';
			editBtn.addEventListener('click', () => {
				D.state.pendingPrompts = D.state.pendingPrompts.filter((x) => x.id !== item.id);
				fn.restoreComposerFromPayload(item);
				fn.renderPendingPrompts();
				fn.updateComposerChrome();
				D.dom.promptEl.focus();
			});

			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.className = 'pending-prompt-remove';
			removeBtn.textContent = 'Remove';
			removeBtn.addEventListener('click', () => {
				D.state.pendingPrompts = D.state.pendingPrompts.filter((x) => x.id !== item.id);
				fn.renderPendingPrompts();
				fn.updateComposerChrome();
			});

			actions.appendChild(editBtn);
			actions.appendChild(removeBtn);
			card.appendChild(body);
			card.appendChild(actions);
			list.appendChild(card);
		}

		D.dom.pendingPromptsEl.appendChild(list);
	}
})(globalThis.DroxChat);
