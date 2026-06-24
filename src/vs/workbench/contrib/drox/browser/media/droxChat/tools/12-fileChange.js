/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	if (!D.state.fileChangeCards) {
		D.state.fileChangeCards = new Map();
	}

	fn.formatFileChangeOpLabel = function (payload) {
		const op = String(payload?.op ?? 'edit');
		if (!payload?.applied && payload?.cancelled) {
			return 'cancelled';
		}
		if (!payload?.applied) {
			return 'skipped';
		}
		if (op === 'write') {
			return 'written';
		}
		if (op === 'delete') {
			return 'deleted';
		}
		return 'edited';
	};

	fn.enableFileChangeUndo = function (toolId) {
		const card = D.state.fileChangeCards.get(String(toolId || ''));
		if (!card) {
			return;
		}
		card.dataset.undoState = 'applied';
		const undoBtn = card.querySelector('.fc-undo');
		if (undoBtn) {
			undoBtn.hidden = false;
		}
	};

	fn.findRunStripForFileChange = function () {
		if (D.state.runStripEl?.isConnected) {
			return D.state.runStripEl;
		}
		if (!D.dom.logEl) {
			return null;
		}
		const strips = [...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip')];
		return strips.length > 0 ? strips[strips.length - 1] : null;
	};

	/** Montage 1.5.2 : work strip → chronologie, sinon #log (late async). */
	fn.mountFileChangeCard = function (card, toolId) {
		const toolBlock = toolId ? D.state.toolBlocks.get(toolId) : undefined;
		let mounted = false;

		if (toolBlock?.isConnected) {
			toolBlock.insertAdjacentElement('afterend', card);
			mounted = true;
		} else if (typeof fn.getRunSection === 'function') {
			const work = fn.getRunSection('work');
			if (work) {
				work.appendChild(card);
				mounted = true;
			}
		}

		if (!mounted) {
			const strip = fn.findRunStripForFileChange();
			if (strip) {
				if (typeof fn.ensureRunStripConnected === 'function') {
					fn.ensureRunStripConnected(strip);
				}
				if (typeof fn.ensureRunWorkOpen === 'function') {
					fn.ensureRunWorkOpen(strip);
				}
				const chrono =
					typeof fn.ensureChronologySection === 'function'
						? fn.ensureChronologySection(strip)
						: null;
				if (chrono) {
					chrono.appendChild(card);
					mounted = true;
				}
			}
		}

		if (!mounted) {
			D.dom.logEl.appendChild(card);
		}

		const strip = fn.findRunStripForFileChange();
		if (strip && typeof fn.ensureRunWorkOpen === 'function') {
			fn.ensureRunWorkOpen(strip);
		}
		card.classList.remove('is-collapsed');
		const toggleBtn = card.querySelector('.fc-toggle');
		if (toggleBtn) {
			toggleBtn.setAttribute('aria-expanded', 'true');
		}
		D.state.logStickToBottom = true;
		fn.scrollLogToEnd?.();
		fn.syncWorkSummaryStats?.(strip || D.state.runStripEl);
	};

	fn.updateFileChangeUndoState = function (toolId, undoState) {
		const card = D.state.fileChangeCards.get(String(toolId || ''));
		if (!card) {
			return;
		}
		card.dataset.undoState = undoState;
		const undoBtn = card.querySelector('.fc-undo');
		const redoBtn = card.querySelector('.fc-redo');
		if (undoBtn) {
			undoBtn.hidden = undoState !== 'applied';
		}
		if (redoBtn) {
			redoBtn.hidden = undoState !== 'reverted';
		}
		if (undoState === 'reverted') {
			card.classList.add('is-reverted');
		} else {
			card.classList.remove('is-reverted');
		}
	};

	fn.renderDiffLines = function (diff, content) {
		const frag = document.createDocumentFragment();
		if (diff && diff.length > 0) {
			const lines = diff.split(/\r?\n/);
			for (const raw of lines) {
				if (
					raw.startsWith('--- ') ||
					raw.startsWith('+++ ') ||
					raw.startsWith('Index: ') ||
					raw.startsWith('==========')
				) {
					continue;
				}
				const line = document.createElement('div');
				if (raw.startsWith('@@')) {
					line.className = 'diff-line diff-hunk';
					line.textContent = raw;
				} else if (raw.startsWith('+') && !raw.startsWith('++')) {
					line.className = 'diff-line diff-add';
					line.textContent = raw;
				} else if (raw.startsWith('-') && !raw.startsWith('--')) {
					line.className = 'diff-line diff-rem';
					line.textContent = raw;
				} else if (raw.length === 0) {
					line.className = 'diff-line diff-ctx';
					line.textContent = ' ';
				} else {
					line.className = 'diff-line diff-ctx';
					line.textContent = raw;
				}
				frag.appendChild(line);
			}
			return frag;
		}
		if (content && content.length > 0) {
			for (const raw of content.split(/\r?\n/)) {
				const line = document.createElement('div');
				line.className = 'diff-line diff-add';
				line.textContent = '+' + raw;
				frag.appendChild(line);
			}
			return frag;
		}
		const empty = document.createElement('div');
		empty.className = 'diff-line diff-ctx';
		empty.textContent = '(no visible diff)';
		frag.appendChild(empty);
		return frag;
	};

	fn.appendFileChange = function (payload) {
		const toolId = String(payload.toolId ?? '');
		if (toolId && D.state.fileChangeCards.has(toolId)) {
			const old = D.state.fileChangeCards.get(toolId);
			old?.remove();
			D.state.fileChangeCards.delete(toolId);
		}

		const filePath = String(payload.path ?? '');
		const relPath = String(payload.relPath ?? payload.path ?? '?');
		const added = Number(payload.added ?? 0);
		const removed = Number(payload.removed ?? 0);
		const language = String(payload.language ?? 'plaintext');
		const applied = payload.applied !== false;
		const cancelled = payload.cancelled === true;
		const canUndo = payload.canUndo === true && applied;
		const diffText = typeof payload.diff === 'string' ? payload.diff : '';
		const contentText = typeof payload.content === 'string' ? payload.content : '';
		const hasVisibleDiff =
			diffText.length > 0 ||
			contentText.length > 0 ||
			added > 0 ||
			removed > 0 ||
			(applied && Boolean(filePath));

		const card = document.createElement('div');
		card.className = 'msg-file-change drox-log-indent msg-ai-frame';
		if (!applied) {
			card.classList.add('is-not-applied');
		}
		if (cancelled) {
			card.classList.add('is-cancelled');
		}
		card.dataset.path = filePath;
		if (toolId) {
			card.dataset.toolId = toolId;
			D.state.fileChangeCards.set(toolId, card);
		}
		card.dataset.undoState = canUndo ? 'applied' : '';

		const header = document.createElement('div');
		header.className = 'fc-summary';
		header.title = 'Open in editor';

		const toggleBtn = document.createElement('button');
		toggleBtn.type = 'button';
		toggleBtn.className = 'fc-toggle';
		toggleBtn.setAttribute('aria-expanded', hasVisibleDiff ? 'true' : 'false');
		toggleBtn.title = 'Expand / collapse diff';
		toggleBtn.innerHTML =
			'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
			'<path d="M4 6l4 4 4-4"></path></svg>';

		const icon = document.createElement('span');
		icon.className = 'fc-icon';
		icon.innerHTML =
			'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
			'<path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6"></path>' +
			'<path d="M9 2v4h4"></path></svg>';

		const opLabel = document.createElement('span');
		opLabel.className = 'fc-op';
		opLabel.textContent = fn.formatFileChangeOpLabel({
			op: payload.op,
			applied,
			cancelled,
		});

		const name = document.createElement('span');
		name.className = 'fc-path';
		name.textContent = relPath;
		name.title = filePath;

		const stats = document.createElement('span');
		stats.className = 'fc-stats';
		if (added > 0) {
			const a = document.createElement('span');
			a.className = 'fc-add';
			a.textContent = `+${added}`;
			stats.appendChild(a);
		}
		if (removed > 0) {
			const r = document.createElement('span');
			r.className = 'fc-rem';
			r.textContent = `-${removed}`;
			stats.appendChild(r);
		}

		const spacer = document.createElement('span');
		spacer.className = 'fc-spacer';

		const undoBtn = document.createElement('button');
		undoBtn.type = 'button';
		undoBtn.className = 'fc-undo';
		undoBtn.title = 'Undo this change';
		undoBtn.textContent = 'Undo';
		undoBtn.hidden = !canUndo;
		undoBtn.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (toolId) {
				D.vscode.postMessage({ type: 'undoFileChange', toolId });
			}
		});

		const redoBtn = document.createElement('button');
		redoBtn.type = 'button';
		redoBtn.className = 'fc-redo';
		redoBtn.title = 'Redo this change';
		redoBtn.textContent = 'Redo';
		redoBtn.hidden = true;
		redoBtn.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (toolId) {
				D.vscode.postMessage({ type: 'redoFileChange', toolId });
			}
		});

		const openBtn = document.createElement('button');
		openBtn.type = 'button';
		openBtn.className = 'fc-open';
		openBtn.title = 'Open in editor';
		openBtn.innerHTML =
			'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
			'<path d="M5 11l6-6"></path>' +
			'<path d="M6 5h5v5"></path></svg>';

		const openInEditor = (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (filePath) {
				D.vscode.postMessage({ type: 'openFile', filePath });
			}
		};

		header.addEventListener('click', (ev) => {
			if (ev.target.closest('.fc-toggle, .fc-open, .fc-undo, .fc-redo')) {
				return;
			}
			openInEditor(ev);
		});
		openBtn.addEventListener('click', openInEditor);

		const body = document.createElement('div');
		body.className = 'fc-body';
		const diffRoot = document.createElement('div');
		diffRoot.className = `fc-diff lang-${language}`;
		diffRoot.appendChild(fn.renderDiffLines(diffText, contentText));
		body.appendChild(diffRoot);

		toggleBtn.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const collapsed = card.classList.toggle('is-collapsed');
			toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		});

		header.appendChild(toggleBtn);
		header.appendChild(icon);
		header.appendChild(opLabel);
		header.appendChild(name);
		if (stats.childElementCount > 0) {
			header.appendChild(stats);
		}
		header.appendChild(spacer);
		header.appendChild(undoBtn);
		header.appendChild(redoBtn);
		header.appendChild(openBtn);
		card.appendChild(header);
		card.appendChild(body);

		fn.mountFileChangeCard(card, toolId);
		fn.syncWorkSummaryStats?.(D.state.runStripEl);
	};
})(globalThis.DroxChat);
