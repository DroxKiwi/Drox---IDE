/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.renderUserMessage = function (text, refs, pastes, images) {
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

		return row;
	}

})(globalThis.DroxChat);
