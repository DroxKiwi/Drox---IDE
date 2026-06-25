/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

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

	fn.appendToLog = function (node) {
		const log = D.dom.logEl;
		if (!log || !node) {
			return node;
		}
		fn.restoreLogAppendChild?.({ insertFragment: true, discardFragment: false });
		log.appendChild(node);
		return node;
	};

	fn.performSend = function(payload) {
		if (typeof fn.resetCycleTimer === 'function') {
			fn.resetCycleTimer();
		}
		fn.restoreLogAppendChild?.({ insertFragment: true, discardFragment: false });
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
