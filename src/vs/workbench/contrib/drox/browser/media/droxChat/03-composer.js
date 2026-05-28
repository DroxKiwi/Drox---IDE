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

	fn.isComposerEmpty = function() {
		return (
			fn.isPromptTextEmpty() &&
			D.state.attachments.length === 0 &&
			D.state.references.length === 0 &&
			D.state.pasteAttachments.length === 0
		);
	}

	fn.pasteLineRef = function(startLine, endLine) {
		const s = Math.max(1, Math.floor(startLine || 1));
		const e = Math.max(s, Math.floor(endLine || s));
		return s === e ? `L${s}` : `L${s}-${e}`;
	}

	fn.normalizeForHash = function(s) {
		return String(s).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
	}

	fn.fnv1a32 = function(input) {
		let hash = 0x811c9dc5;
		for (let i = 0; i < input.length; i++) {
			hash ^= input.charCodeAt(i);
			hash =
				(hash +
					((hash << 1) +
						(hash << 4) +
						(hash << 7) +
						(hash << 8) +
						(hash << 24))) >>>
				0;
		}
		return hash.toString(16).padStart(8, '0');
	}

	fn.updatePromptPlaceholder = function() {
		let ph = D.const.DEFAULT_PROMPT_PLACEHOLDER;
		if (D.state.pendingPrompts.length > 0 && fn.isPromptTextEmpty()) {
			ph = '↑ edit queued messages · Enter = queue';
		} else if (D.state.pasteAttachments.length > 0 && fn.isPromptTextEmpty()) {
			ph = `${D.state.pasteAttachments.length} snippet(s) — @ path or send`;
		}
		D.dom.promptEl.placeholder = ph;
	}

	fn.renderRefs = function() {
		if (!D.dom.refsEl) {
			return;
		}
		D.dom.refsEl.replaceChildren();
		for (const ref of D.state.references) {
			const chip = document.createElement('span');
			chip.className = 'ref-chip';
			chip.title = ref.uri;
			const label = document.createElement('span');
			label.className = 'ref-label';
			label.textContent = ref.label;
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'ref-remove';
			remove.textContent = '×';
			remove.title = 'Remove';
			remove.addEventListener('click', () => {
				D.state.references = D.state.references.filter((r) => r.id !== ref.id);
				fn.renderRefs();
			});
			chip.appendChild(label);
			chip.appendChild(remove);
			D.dom.refsEl.appendChild(chip);
		}
		for (const p of D.state.pasteAttachments) {
			const chip = document.createElement('span');
			const isTerminal = p.kind === 'terminal';
			chip.className = isTerminal
				? 'ref-chip paste-chip paste-chip-terminal'
				: 'ref-chip paste-chip';
			const lineRef = fn.pasteLineRef(p.startLine, p.endLine);
			const refPath = p.relPath ?? p.absPath ?? '';
			const chipLabel = isTerminal
				? `${refPath || 'Terminal'} · ${lineRef}`
				: `${fn.labelFor(refPath)} · ${lineRef}`;
			chip.title = chipLabel;
			const label = document.createElement('button');
			label.type = 'button';
			label.className = 'ref-label paste-label';
			label.textContent = chipLabel;
			label.addEventListener('click', () => {
				D.vscode.postMessage({
					type: 'openPasteSource',
					kind: p.kind,
					absPath: p.absPath,
					relPath: p.relPath,
					startLine: p.startLine,
					endLine: p.endLine,
				});
			});
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'ref-remove';
			remove.textContent = '×';
			remove.title = 'Remove';
			remove.addEventListener('click', () => {
				D.state.pasteAttachments = D.state.pasteAttachments.filter((x) => x.id !== p.id);
				fn.renderRefs();
			});
			chip.appendChild(label);
			chip.appendChild(remove);
			D.dom.refsEl.appendChild(chip);
		}
		fn.updatePromptPlaceholder();
	}

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

	fn.prefillComposer = function(text, opts = {}) {
		const t = (text || '').trim();
		if (!t) {
			return;
		}
		if (opts.replace) {
			fn.setPromptText(t);
			fn.placeCaretAtEnd();
		} else {
			const v = fn.getPromptText();
			const prefix =
				v.length > 0 && !v.endsWith('\n') && !v.endsWith('\n\n') ? '\n\n' : '';
			const suffix = t.endsWith('\n') ? '' : '\n';
			fn.setPromptText(v + prefix + t + suffix);
			fn.placeCaretAtEnd();
		}
		D.dom.promptEl.focus();
		fn.updatePromptPlaceholder();
	}

	fn.restoreComposerFromPayload = function(item) {
		D.state.references = (item.references || []).map((r) => ({
			id: fn.randomId(),
			uri: r.uri,
			label: fn.labelFor(r.uri.startsWith('file://') ? fn.fileUriToPath(r.uri) : r.uri),
		}));
		fn.setPromptText(item.prompt || '');
		D.state.attachments = (item.attachments || []).map((a) => ({
			id: fn.randomId(),
			name: a.name,
			mime: a.mime,
			dataUrl: a.dataUrl,
		}));
		D.state.pasteAttachments = (item.pastes || []).map((p) => ({
			id: fn.randomId(),
			token: p.token || '',
			kind: p.kind || 'editor',
			absPath: p.absPath || '',
			relPath: p.relPath ?? null,
			languageId: p.languageId || 'plaintext',
			startLine: p.startLine || 1,
			endLine: p.endLine || 1,
			lineCount: p.lineCount || 1,
			text: p.text || '',
		}));
		fn.renderAttachments();
		fn.renderRefs();
		fn.updatePromptPlaceholder();
	}

	fn.fileUriToPath = function(uri) {
		try {
			let p = uri.replace(/^file:\/\//, '');
			p = decodeURIComponent(p);
			if (/^\/[a-zA-Z]:/.test(p)) {
				p = p.slice(1);
			}
			return p;
		} catch {
			return uri;
		}
	}

	fn.labelFor = function(p) {
		const norm = p.replaceAll('\\', '/');
		const parts = norm.split('/').filter(Boolean);
		if (parts.length === 0) {
			return p;
		}
		if (parts.length === 1) {
			return parts[0];
		}
		return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
	}

	fn.refKey = function(uri) {
		return String(uri || '').trim().toLowerCase();
	}

	fn.addUriRefs = function(uris) {
		const existing = new Set(D.state.references.map((r) => fn.refKey(r.uri)));
		for (const u of uris) {
			const trimmed = String(u || '').trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}
			const key = fn.refKey(trimmed);
			if (existing.has(key)) {
				continue;
			}
			existing.add(key);
			const filePath = trimmed.startsWith('file://') ? fn.fileUriToPath(trimmed) : trimmed;
			const ref = {
				id: fn.randomId(),
				uri: trimmed,
				label: fn.labelFor(filePath),
			};
			D.state.references.push(ref);
		}
		fn.renderRefs();
		D.dom.promptEl.focus();
		fn.updatePromptPlaceholder();
	}

	fn.snapshotComposerPayload = function(text) {
		const prompt = typeof text === 'string' ? text : fn.getPromptText();
		return {
			prompt,
			mode: fn.getPermissionMode(),
			attachments: D.state.attachments.map((a) => ({
				name: a.name,
				mime: a.mime,
				dataUrl: a.dataUrl,
			})),
			references: D.state.references.map((r) => ({ uri: r.uri })),
			pastes: D.state.pasteAttachments.map((p) => ({
				kind: p.kind,
				absPath: p.absPath,
				relPath: p.relPath,
				languageId: p.languageId,
				startLine: p.startLine,
				endLine: p.endLine,
				lineCount: p.lineCount,
				text: p.text,
			})),
		};
	}

	fn.clearComposerAfterSend = function() {
		fn.clearPromptText();
		D.state.attachments = [];
		D.state.references = [];
		D.state.pasteAttachments = [];
		fn.renderAttachments();
		fn.renderRefs();
		fn.updatePromptPlaceholder();
	}

	fn.parseSlashCommand = function(raw) {
		const trimmed = raw.trim();
		if (!trimmed.startsWith('/')) {
			return null;
		}
		const firstNl = trimmed.indexOf('\n');
		const head = firstNl === -1 ? trimmed : trimmed.slice(0, firstNl);
		const afterFirst = firstNl === -1 ? '' : trimmed.slice(firstNl + 1);
		if (afterFirst.trim().length > 0) {
			return null;
		}
		const m = /^\/([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+(.*))?$/.exec(head.trim());
		if (!m) {
			return null;
		}
		return { command: m[1].toLowerCase(), args: (m[2] || '').trim() };
	}

	fn.tryEnqueueFromComposer = function() {
		const raw = fn.getPromptText();
		if (fn.parseSlashCommand(raw)) {
			D.vscode.postMessage({
				type: 'slash',
				slashInvalid: 'Slash commands cannot be queued while a run is in progress.',
			});
			return false;
		}
		const text = raw.trim();
		if (fn.isComposerEmpty()) {
			return false;
		}
		D.state.pendingPrompts.push({
			id: fn.randomId(),
			...fn.snapshotComposerPayload(text),
		});
		fn.clearComposerAfterSend();
		fn.renderPendingPrompts();
		fn.updateComposerChrome();
		return true;
	}

	fn.performSend = function(payload) {
		if (typeof fn.resetCycleTimer === 'function') {
			fn.resetCycleTimer();
		}
		fn.setBusy(true);
		fn.showWarmupActivity();
		D.vscode.postMessage({
			type: 'send',
			prompt: payload.prompt || '',
			mode: payload.mode || fn.getPermissionMode(),
			attachments: (payload.attachments || []).map((a) => ({
				name: a.name,
				mime: a.mime,
				dataUrl: a.dataUrl,
			})),
			references: (payload.references || []).map((r) => ({ uri: r.uri })),
			pastes: (payload.pastes || []).map((p) => ({
				kind: p.kind,
				absPath: p.absPath,
				relPath: p.relPath,
				languageId: p.languageId,
				startLine: p.startLine,
				endLine: p.endLine,
				lineCount: p.lineCount,
				text: p.text,
			})),
		});
		fn.clearComposerAfterSend();
	}

	fn.flushPendingPromptQueue = function() {
		if (D.state.busy || D.state.userAskPending || D.state.pendingPrompts.length === 0) {
			return;
		}
		const item = D.state.pendingPrompts.shift();
		fn.renderPendingPrompts();
		fn.updateComposerChrome();
		fn.performSend(item);
	}

	fn.doSend = function() {
		if (D.state.userAskPending && !D.state.busy) {
			return;
		}
		const raw = fn.getPromptText();
		const slash = fn.parseSlashCommand(raw);
		if (D.state.busy) {
			if (D.state.userAskPending) {
				return;
			}
			if (slash) {
				D.vscode.postMessage({
					type: 'slash',
					slashInvalid: 'Slash commands cannot be queued while a run is in progress.',
				});
				return;
			}
			fn.tryEnqueueFromComposer();
			return;
		}
		if (slash) {
			if (
				(D.state.attachments.length > 0 ||
					D.state.references.length > 0 ||
					D.state.pasteAttachments.length > 0) &&
				slash.command !== 'clear' &&
				slash.command !== 'new'
			) {
				D.vscode.postMessage({
					type: 'slash',
					slashInvalid:
						'Remove images, references, and snippets for this command (except /clear or /new).',
				});
				return;
			}
			if (slash.command === 'clear' || slash.command === 'new') {
				D.state.pendingPrompts = [];
				fn.renderPendingPrompts();
				D.state.attachments = [];
				D.state.references = [];
				D.state.pasteAttachments = [];
				fn.renderAttachments();
				fn.clearPromptText();
				fn.renderRefs();
				fn.updatePromptPlaceholder();
			}
			D.vscode.postMessage({
				type: 'slash',
				command: slash.command,
				args: slash.args,
			});
			fn.clearPromptText();
			fn.updateComposerChrome();
			return;
		}
		const text = raw.trim();
		if (fn.isComposerEmpty()) {
			return;
		}
		fn.performSend(fn.snapshotComposerPayload(text));
	}
})(globalThis.DroxChat);
