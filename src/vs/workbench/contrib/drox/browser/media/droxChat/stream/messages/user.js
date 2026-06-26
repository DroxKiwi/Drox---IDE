/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const COPY_ICON_SVG =
		'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<rect x="5.5" y="5.5" width="8" height="8" rx="1"></rect>' +
		'<path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"></path>' +
		'</svg>';

	fn.copyTextToClipboard = function (text) {
		const value = String(text ?? '');
		if (!value) {
			return Promise.resolve(false);
		}
		if (navigator.clipboard?.writeText) {
			return navigator.clipboard.writeText(value).then(
				() => true,
				() => false,
			);
		}
		return Promise.resolve(false);
	};

	fn.flashUserCopyButton = function (btn) {
		if (!btn) {
			return;
		}
		btn.classList.add('is-copied');
		const prev = btn.getAttribute('aria-label');
		btn.setAttribute('aria-label', 'Copié');
		btn.title = 'Copié';
		window.setTimeout(() => {
			btn.classList.remove('is-copied');
			if (prev) {
				btn.setAttribute('aria-label', prev);
			} else {
				btn.removeAttribute('aria-label');
			}
			btn.title = 'Copier le message';
		}, 1400);
	};

	fn.attachUserMessageCopyAction = function (row, fullText) {
		if (!row || row.querySelector('.msg-user-copy')) {
			return;
		}
		const text = String(fullText ?? '').trim();
		if (!text) {
			return;
		}
		row.dataset.fullText = text;

		let toolbar = row.querySelector('.msg-user-toolbar');
		if (!toolbar) {
			toolbar = document.createElement('div');
			toolbar.className = 'msg-user-toolbar';
			row.insertBefore(toolbar, row.firstChild);
		}

		const copyBtn = document.createElement('button');
		copyBtn.type = 'button';
		copyBtn.className = 'msg-user-copy';
		copyBtn.title = 'Copier le message';
		copyBtn.setAttribute('aria-label', 'Copier le message');
		copyBtn.innerHTML = COPY_ICON_SVG;
		copyBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const payload = row.dataset.fullText || text;
			void fn.copyTextToClipboard(payload).then((ok) => {
				if (ok) {
					fn.flashUserCopyButton(copyBtn);
				}
			});
		});
		toolbar.appendChild(copyBtn);
	};

	const USER_COMMIT_HINT =
		'Commit regularly — the agent can make mistakes.';

	fn.resolveUserMessageRow = function (el) {
		if (!el) {
			return null;
		}
		if (el.classList?.contains('msg-row-user')) {
			return el;
		}
		return el.querySelector?.('.msg-row-user') ?? null;
	};

	fn.resolveUserMessageAnchor = function (el) {
		if (!el) {
			return null;
		}
		if (el.classList?.contains('msg-user-block')) {
			return el;
		}
		const block = el.closest?.('.msg-user-block');
		if (block) {
			return block;
		}
		if (el.classList?.contains('msg-row-user')) {
			return el;
		}
		return null;
	};

	fn.queryUserMessageRows = function (root) {
		const scope = root || D.dom.logEl;
		if (!scope?.querySelectorAll) {
			return [];
		}
		return [
			...scope.querySelectorAll(':scope > .msg-user-block > .msg-row-user'),
			...scope.querySelectorAll(':scope > .msg-row-user'),
		];
	};

	fn.renderUserMessage = function (text, refs, pastes, images) {
		const block = document.createElement('div');
		block.className = 'msg-user-block';

		const hint = document.createElement('p');
		hint.className = 'msg-user-commit-hint';
		hint.textContent = USER_COMMIT_HINT;
		block.appendChild(hint);

		const row = document.createElement('div');
		row.className = 'msg-row-user msg user msg-user-bubble';

		const body = document.createElement('div');
		body.className = 'msg-user-body';
		const trimmed = String(text || '').trim();
		if (trimmed) {
			const textSpan = document.createElement('span');
			textSpan.className = 'msg-user-text';
			textSpan.textContent = trimmed;
			textSpan.classList.add('is-clamped');
			fn.bindUserMessageExpand(row, textSpan, trimmed);
			body.appendChild(textSpan);
			fn.attachUserMessageCopyAction(row, trimmed);
		}
		for (const ref of refs || []) {
			const link = document.createElement('button');
			link.type = 'button';
			link.className = 'msg-ref-link';
			const path = ref.rel || ref.abs || ref.uri || '';
			const name = ref.label || fn.basenameForRef(path);
			const label = document.createElement('span');
			label.className = 'msg-ref-link-label';
			label.textContent = ref.kind === 'directory' ? `${name}/` : name;
			link.title = ref.abs || ref.uri || path;
			link.appendChild(label);
			link.addEventListener('click', (e) => {
				e.stopPropagation();
				const openPath = ref.abs || (ref.uri?.startsWith('file://') ? fn.fileUriToPath(ref.uri) : ref.uri);
				if (openPath) {
					D.vscode.postMessage({ type: 'openFile', filePath: openPath });
				}
			});
			body.appendChild(link);
		}

		for (const p of pastes || []) {
			const link = document.createElement('button');
			link.type = 'button';
			const isTerminal = p.kind === 'terminal';
			link.className = isTerminal ? 'msg-ref-link msg-paste-link msg-paste-terminal' : 'msg-ref-link msg-paste-link';
			const lineRef = fn.pasteLineRef(p.startLine, p.endLine);
			const refPath = p.relPath ?? p.absPath ?? '';
			const label = document.createElement('span');
			label.className = 'msg-ref-link-label';
			label.textContent = isTerminal
				? `${refPath || 'Terminal'} · ${lineRef}`
				: `${fn.basenameForRef(refPath)} · ${lineRef}`;
			link.title = isTerminal
				? `Terminal — ${lineRef}`
				: `${refPath} — ${lineRef}`;
			link.appendChild(label);
			link.addEventListener('click', (e) => {
				e.stopPropagation();
				D.vscode.postMessage({
					type: 'openPasteSource',
					kind: p.kind,
					absPath: p.absPath,
					relPath: p.relPath,
					startLine: p.startLine,
					endLine: p.endLine,
				});
			});
			body.appendChild(link);
		}

		if (body.childElementCount > 0) {
			row.appendChild(body);
		}

		if (images && images.length > 0) {
			const gallery = document.createElement('div');
			gallery.className = 'msg-user-images';
			for (const img of images) {
				const wrap = document.createElement('div');
				wrap.className = 'msg-user-image';
				wrap.title = img.relPath || '';
				const el = document.createElement('img');
				const src = String(img.dataUrl || '').trim();
				el.src = src;
				el.alt = img.relPath || 'image';
				if (!src.startsWith('data:')) {
					el.classList.add('msg-user-image-broken');
				}
				wrap.appendChild(el);
				gallery.appendChild(wrap);
			}
			row.appendChild(gallery);
		}

		block.appendChild(row);
		return block;
	};

	fn.optimisticUserImagesFromPayload = function (attachments) {
		const out = [];
		for (const a of attachments || []) {
			const dataUrl = String(a?.dataUrl || '').trim();
			if (!dataUrl) {
				continue;
			}
			out.push({
				relPath: String(a.name || 'image'),
				dataUrl,
			});
		}
		return out;
	};

	/** Bulle utilisateur immédiate à l'envoi — séparateur de tour, avant warmup / host. */
	fn.showOptimisticUserMessage = function (payload) {
		if (D.state.uiReplayActive || !D.dom.logEl) {
			return null;
		}
		fn.resetLinearTurnAnchors?.();
		fn.resetChatStreamForTurn?.();
		fn.clearOptimisticUserMessages?.();
		const prompt = String(payload?.prompt || '').trim();
		const refs = Array.isArray(payload?.references) ? payload.references : [];
		const pastes = Array.isArray(payload?.pastes) ? payload.pastes : [];
		const images = fn.optimisticUserImagesFromPayload(payload?.attachments);
		if (!prompt && refs.length === 0 && pastes.length === 0 && images.length === 0) {
			return null;
		}
		const sendId = String(payload?.clientSendId || fn.randomId());
		const userBlock = fn.renderUserMessage(prompt, refs, pastes, images);
		const userRow = fn.resolveUserMessageRow(userBlock);
		if (userRow) {
			userRow.dataset.msgId = `optimistic_${sendId}`;
			userRow.dataset.optimisticUser = '1';
			userRow.dataset.clientSendId = sendId;
		}
		D.state.pendingOptimisticUserSendId = sendId;
		fn.appendToLog?.(userBlock);
		fn.refreshLastUserStickyRow?.();
		fn.scrollLogToEnd?.() || fn.scrollLog?.();
		return userBlock;
	};

	fn.clearOptimisticUserMessages = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		for (const row of [...log.querySelectorAll('.msg-row-user[data-optimistic-user="1"]')]) {
			row.closest('.msg-user-block')?.remove();
		}
		D.state.pendingOptimisticUserSendId = null;
	};

	/** Retire la bulle optimiste ; le message host est toujours ajouté ensuite. */
	fn.reconcileOptimisticUserMessage = function () {
		fn.clearOptimisticUserMessages?.();
		return false;
	};

})(globalThis.DroxChat);
