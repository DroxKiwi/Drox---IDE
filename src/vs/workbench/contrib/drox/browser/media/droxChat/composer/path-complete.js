/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.findAtCompletionContext = function(value, cursor) {
		const before = value.slice(0, cursor);
		const match = before.match(/(?:^|\s)@([^\s@]*)$/);
		if (!match) {
			return null;
		}
		const query = match[1] ?? '';
		const replaceStart = before.length - query.length - 1;
		return { query, replaceStart, replaceEnd: cursor };
	}

	fn.hidePathSuggestions = function() {
		D.state.pathSuggestions = null;
		if (D.state.pathCompleteTimer) {
			clearTimeout(D.state.pathCompleteTimer);
			D.state.pathCompleteTimer = null;
		}
		if (D.dom.suggestionsEl) {
			D.dom.suggestionsEl.setAttribute('hidden', '');
			D.dom.suggestionsEl.replaceChildren();
		}
	}

	fn.renderPathSuggestions = function() {
		if (!D.dom.suggestionsEl || !D.state.pathSuggestions || D.state.pathSuggestions.items.length === 0) {
			if (D.dom.suggestionsEl) {
				D.dom.suggestionsEl.setAttribute('hidden', '');
				D.dom.suggestionsEl.replaceChildren();
			}
			return;
		}
		D.dom.suggestionsEl.removeAttribute('hidden');
		D.dom.suggestionsEl.replaceChildren();
		D.state.pathSuggestions.items.forEach((item, idx) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'prompt-suggestion-item';
			if (idx === D.state.pathSuggestions.selected) {
				btn.classList.add('selected');
			}
			btn.setAttribute('role', 'option');
			btn.setAttribute(
				'aria-selected',
				idx === D.state.pathSuggestions.selected ? 'true' : 'false',
			);
			const label = document.createElement('span');
			label.className = 'prompt-suggestion-label';
			label.textContent = item.label;
			const meta = document.createElement('span');
			meta.className = 'prompt-suggestion-meta';
			meta.textContent = item.description || item.kind;
			btn.appendChild(label);
			btn.appendChild(meta);
			btn.addEventListener('mousedown', (e) => {
				e.preventDefault();
				fn.applyPathSuggestion(item);
			});
			D.dom.suggestionsEl.appendChild(btn);
		});
	}

	fn.applyPathSuggestion = function(item) {
		if (!D.state.pathSuggestions) {
			return;
		}
		const ctx = fn.findAtCompletionContext(fn.getPromptText(), fn.getPromptCursor());
		if (!ctx) {
			fn.hidePathSuggestions();
			return;
		}
		const pathPart = item.insertText.replace(/^\.\//, '');
		const insert = `@${pathPart}`;
		const before = fn.getPromptText().slice(0, ctx.replaceStart);
		const after = fn.getPromptText().slice(ctx.replaceEnd);
		fn.setPromptText(before + insert + after);
		fn.hidePathSuggestions();
		fn.updatePromptPlaceholder();
		D.dom.promptEl.focus();
		const caret = before.length + insert.length;
		D.dom.promptEl.setSelectionRange(caret, caret);
	}

	fn.schedulePathComplete = function() {
		if (D.state.pathCompleteTimer) {
			clearTimeout(D.state.pathCompleteTimer);
		}
		const cursor = fn.getPromptCursor();
		const ctx = fn.findAtCompletionContext(fn.getPromptText(), cursor);
		if (!ctx) {
			fn.hidePathSuggestions();
			return;
		}
		D.state.pathCompleteTimer = setTimeout(() => {
			D.state.pathCompleteTimer = null;
			const reqId = `pc_${++D.state.pathCompleteSeq}`;
			D.state.pathCompletePendingId = reqId;
			D.state.pathSuggestions = {
				items: [],
				selected: 0,
				replaceStart: ctx.replaceStart,
				replaceEnd: ctx.replaceEnd,
			};
			D.vscode.postMessage({
				type: 'pathComplete',
				requestId: reqId,
				query: ctx.query,
			});
		}, 120);
	}

	fn.pathSuggestionsOpen = function() {
		return Boolean(
			D.state.pathSuggestions &&
				D.state.pathSuggestions.items &&
				D.state.pathSuggestions.items.length > 0 &&
				D.dom.suggestionsEl &&
				!D.dom.suggestionsEl.hasAttribute('hidden'),
		);
	}
})(globalThis.DroxChat);
