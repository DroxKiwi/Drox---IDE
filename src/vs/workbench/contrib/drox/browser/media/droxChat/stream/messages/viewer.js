/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;
	fn.ensureUserMessageViewer = function () {
		if (D.dom.userMsgViewerOverlay) {
			return;
		}
		const overlay = document.createElement('div');
		overlay.className = 'drox-user-msg-viewer-overlay';
		overlay.hidden = true;
		const panel = document.createElement('div');
		panel.className = 'drox-user-msg-viewer-panel';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-modal', 'true');
		panel.setAttribute('aria-label', 'Message utilisateur');
		const header = document.createElement('div');
		header.className = 'drox-user-msg-viewer-header';
		const title = document.createElement('span');
		title.className = 'drox-user-msg-viewer-title';
		title.textContent = 'Votre message';
		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'drox-user-msg-viewer-close';
		closeBtn.textContent = 'Fermer';
		closeBtn.setAttribute('aria-label', 'Fermer');
		header.appendChild(title);
		header.appendChild(closeBtn);
		const content = document.createElement('div');
		content.className = 'drox-user-msg-viewer-content';
		panel.appendChild(header);
		panel.appendChild(content);
		overlay.appendChild(panel);
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				fn.closeUserMessageViewer();
			}
		});
		closeBtn.addEventListener('click', () => fn.closeUserMessageViewer());
		panel.addEventListener('click', (e) => e.stopPropagation());
		if (!D.state.userMsgViewerEscapeBound) {
			D.state.userMsgViewerEscapeBound = true;
			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && D.dom.userMsgViewerOverlay && !D.dom.userMsgViewerOverlay.hidden) {
					fn.closeUserMessageViewer();
				}
			});
		}
		document.body.appendChild(overlay);
		D.dom.userMsgViewerOverlay = overlay;
		D.dom.userMsgViewerContent = content;
	};

	fn.openUserMessageViewer = function (text) {
		fn.ensureUserMessageViewer();
		D.dom.userMsgViewerContent.textContent = String(text || '');
		D.dom.userMsgViewerOverlay.hidden = false;
	};

	fn.closeUserMessageViewer = function () {
		if (D.dom.userMsgViewerOverlay) {
			D.dom.userMsgViewerOverlay.hidden = true;
		}
	};

	fn.bindUserMessageExpand = function (row, textSpan, fullText) {
		const markExpandable = () => {
			if (!textSpan.classList.contains('is-clamped')) {
				return;
			}
			const overflows = textSpan.scrollHeight > textSpan.clientHeight + 2;
			if (overflows) {
				row.classList.add('msg-user-expandable');
				row.setAttribute('title', 'Cliquer pour voir le message complet');
				row.setAttribute('tabindex', '0');
				row.setAttribute('role', 'button');
			}
		};
		requestAnimationFrame(() => requestAnimationFrame(markExpandable));
		const onOpen = (e) => {
			if (!row.classList.contains('msg-user-expandable')) {
				return;
			}
			if (e.target.closest('.msg-ref-link, .msg-paste-link, .msg-paste-terminal')) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			fn.openUserMessageViewer(fullText);
		};
		row.addEventListener('click', onOpen);
		row.addEventListener('keydown', (e) => {
			if (
				(e.key === 'Enter' || e.key === ' ') &&
				row.classList.contains('msg-user-expandable')
			) {
				e.preventDefault();
				fn.openUserMessageViewer(fullText);
			}
		});
	};

})(globalThis.DroxChat);
