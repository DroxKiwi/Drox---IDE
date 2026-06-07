/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

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
})(globalThis.DroxChat);
