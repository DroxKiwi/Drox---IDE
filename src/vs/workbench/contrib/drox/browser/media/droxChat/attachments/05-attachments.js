/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.fileIsImage = function(file) {
		return typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/');
	}

	fn.readAsDataUrl = function(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error ?? new Error('read failed'));
			reader.onload = () =>
				resolve({
					id: fn.randomId(),
					name: file.name || 'image',
					mime: file.type || 'image/png',
					dataUrl: String(reader.result),
				});
			reader.readAsDataURL(file);
		});
	}

	fn.renderAttachments = function() {
		if (!D.dom.attachmentsEl) {
			return;
		}
		D.dom.attachmentsEl.innerHTML = '';
		for (const att of D.state.attachments) {
			const wrap = document.createElement('div');
			wrap.className = 'attachment';
			wrap.title = att.name;
			const img = document.createElement('img');
			const src = String(att.dataUrl || '').trim();
			img.src = src;
			img.alt = att.name;
			if (!src.startsWith('data:')) {
				img.classList.add('attachment-broken');
			}
			img.addEventListener('error', () => {
				img.classList.add('attachment-broken');
				img.alt = att.name || 'image';
			});
			const remove = document.createElement('button');
			remove.className = 'remove';
			remove.type = 'button';
			remove.textContent = '×';
			remove.title = 'Remove';
			remove.addEventListener('click', () => {
				D.state.attachments = D.state.attachments.filter((a) => a.id !== att.id);
				fn.renderAttachments();
			});
			wrap.appendChild(img);
			wrap.appendChild(remove);
			D.dom.attachmentsEl.appendChild(wrap);
		}
	}

	fn.addFiles = async function(files) {
		if (!files) {
			return;
		}
		const incoming = Array.from(files).filter(fn.fileIsImage);
		for (const f of incoming) {
			try {
				D.state.attachments.push(await fn.readAsDataUrl(f));
			} catch {
				/* ignore */
			}
		}
		fn.renderAttachments();
	}

	fn.addHostAttachments = function(items) {
		if (!items?.length) {
			return;
		}
		for (const a of items) {
			if (!a?.dataUrl) {
				continue;
			}
			D.state.attachments.push({
				id: fn.randomId(),
				name: a.name || 'image',
				mime: a.mime || 'image/png',
				dataUrl: a.dataUrl,
			});
		}
		fn.renderAttachments();
	}

	fn.setDropHighlight = function(active) {
		D.dom.composerEl?.classList.toggle('drop-active', Boolean(active));
	}

	fn.parseUriListLines = function(raw) {
		const out = [];
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}
			out.push(trimmed);
		}
		return out;
	}

	fn.handleComposerDrop = function(e) {
		e.preventDefault();
		fn.setDropHighlight(false);
		const dt = e.dataTransfer;
		let handledLocally = false;
		if (dt) {
			if (dt.files?.length) {
				void fn.addFiles(dt.files);
				handledLocally = true;
			}
			const uriList =
				dt.getData('text/uri-list') ||
				dt.getData('application/vnd.code.uri-list');
			if (uriList) {
				fn.addUriRefs(fn.parseUriListLines(uriList));
				handledLocally = true;
			}
			const plain = dt.getData('text/plain');
			if (plain && !uriList) {
				const trimmed = plain.trim();
				if (
					trimmed.includes('://') ||
					/^[a-zA-Z]:[\\/]/.test(trimmed) ||
					trimmed.startsWith('/')
				) {
					fn.addUriRefs([trimmed]);
					handledLocally = true;
				}
			}
		}
		// Explorateur VS Code : les URI sont sur le workbench, pas dans le webview.
		if (!handledLocally) {
			D.vscode.postMessage({ type: 'composerDrop' });
		}
	}

	fn.handleComposerDragOver = function(e) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
		fn.setDropHighlight(true);
	}

	fn.handleComposerDragLeave = function(e) {
		const related = e.relatedTarget;
		if (related && D.dom.composerEl?.contains(/** @type {Node} */ (related))) {
			return;
		}
		fn.setDropHighlight(false);
	}
})(globalThis.DroxChat);
