/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

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
		empty.textContent = '(aucun changement visible)';
		frag.appendChild(empty);
		return frag;
	};

	fn.appendFileChange = function (payload) {
		const filePath = String(payload.path ?? '');
		const relPath = String(payload.relPath ?? payload.path ?? '?');
		const op = payload.op === 'write' ? 'written' : 'edited';
		const added = Number(payload.added ?? 0);
		const removed = Number(payload.removed ?? 0);
		const language = String(payload.language ?? 'plaintext');
		const toolId = String(payload.toolId ?? '');

		const card = document.createElement('div');
		card.className = 'msg-file-change drox-log-indent msg-ai-frame';
		card.dataset.path = filePath;

		const header = document.createElement('div');
		header.className = 'fc-summary';
		header.title = 'Open in editor';

		const toggleBtn = document.createElement('button');
		toggleBtn.type = 'button';
		toggleBtn.className = 'fc-toggle';
		toggleBtn.setAttribute('aria-expanded', 'true');
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
		opLabel.textContent = op;

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
			if (ev.target.closest('.fc-toggle, .fc-open')) {
				return;
			}
			openInEditor(ev);
		});
		openBtn.addEventListener('click', openInEditor);

		const body = document.createElement('div');
		body.className = 'fc-body';
		const pre = document.createElement('pre');
		pre.className = `fc-diff lang-${language}`;
		pre.appendChild(
			fn.renderDiffLines(
				typeof payload.diff === 'string' ? payload.diff : '',
				typeof payload.content === 'string' ? payload.content : '',
			),
		);
		body.appendChild(pre);

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
		header.appendChild(openBtn);
		card.appendChild(header);
		card.appendChild(body);

		const toolBlock = toolId ? D.state.toolBlocks.get(toolId) : undefined;
		const executorTools =
			typeof fn.resolveExecutorStreamToolsMount === 'function'
				? fn.resolveExecutorStreamToolsMount(toolBlock)
				: null;
		// Exécuteur : la ligne outil vit dans un rail replié — monter le diff dans .executor-stream-tools.
		if (executorTools) {
			executorTools.appendChild(card);
		} else if (toolBlock?.isConnected) {
			toolBlock.insertAdjacentElement('afterend', card);
		} else if (typeof fn.getRunSection === 'function' && fn.getRunSection('work')) {
			fn.getRunSection('work').appendChild(card);
		} else {
			D.dom.logEl.appendChild(card);
		}
		D.state.logStickToBottom = true;
		fn.scrollLog(true);
	};
})(globalThis.DroxChat);
