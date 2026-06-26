/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.bindChatVersionReleaseNotes = function () {
		const el = D.dom.chatVersionEl;
		if (!el || el.dataset.droxReleaseNotesBound === '1') {
			return;
		}
		el.dataset.droxReleaseNotesBound = '1';
		el.classList.add('drox-chat-brand-version--interactive');
		el.setAttribute('role', 'button');
		el.tabIndex = 0;
		const open = () => D.vscode.postMessage({ type: 'showReleaseNotes' });
		el.addEventListener('click', open);
		el.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				open();
			}
		});
	};

	if (D.dom.attachBtn && D.dom.fileInput) {
		D.dom.attachBtn.addEventListener('click', () => D.dom.fileInput.click());
		D.dom.fileInput.addEventListener('change', () => {
			void fn.addFiles(D.dom.fileInput.files);
			D.dom.fileInput.value = '';
		});
	}
	D.dom.promptEl.addEventListener('paste', (e) => {
		const dt = e.clipboardData;
		if (!dt) {
			return;
		}
		const files = [];
		const items = dt.items;
		if (items) {
			for (let i = 0; i < items.length; i++) {
				const it = items[i];
				if (it.kind === 'file') {
					const f = it.getAsFile();
					if (f && fn.fileIsImage(f)) {
						files.push(f);
					}
				}
			}
		}
		if (files.length > 0) {
			e.preventDefault();
			void fn.addFiles(files);
			return;
		}
		const pasted = dt.getData('text/plain');
		if (!pasted) {
			return;
		}
		const normalized = fn.normalizeForHash(pasted);
		if (!normalized.trim()) {
			return;
		}
		const token = fn.fnv1a32(normalized);
		const cand = D.state.pasteCandidates.get(token);
		if (!cand) {
			return;
		}
		if (D.state.pasteAttachments.some((p) => p.token === token)) {
			e.preventDefault();
			return;
		}
		e.preventDefault();
		D.state.pasteAttachments.push({
			id: fn.randomId(),
			token: cand.token,
			kind: cand.kind,
			absPath: cand.absPath,
			relPath: cand.relPath,
			languageId: cand.languageId,
			startLine: cand.startLine,
			endLine: cand.endLine,
			lineCount: cand.lineCount,
			text: cand.text,
		});
		fn.renderRefs();
		fn.updatePromptPlaceholder();
	});
	if (D.dom.composerEl) {
		D.dom.composerEl.addEventListener('dragover', fn.handleComposerDragOver);
		D.dom.composerEl.addEventListener('dragleave', fn.handleComposerDragLeave);
		D.dom.composerEl.addEventListener('drop', fn.handleComposerDrop);
	}
	if (D.dom.promptEl) {
		D.dom.promptEl.addEventListener('dragover', fn.handleComposerDragOver);
		D.dom.promptEl.addEventListener('dragleave', fn.handleComposerDragLeave);
		D.dom.promptEl.addEventListener('drop', fn.handleComposerDrop);
	}

	if (D.dom.sendBtn) {
		D.dom.sendBtn.addEventListener('click', () => {
			fn.handleSendButtonClick();
		});
	}

	D.dom.promptEl.addEventListener('input', () => {
		fn.syncPromptInputHeight();
		fn.updatePromptPlaceholder();
		fn.schedulePathComplete();
	});

	D.dom.promptEl.addEventListener('keydown', (e) => {
		if (e.isComposing) {
			return;
		}

		if (fn.pathSuggestionsOpen()) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				D.state.pathSuggestions.selected = Math.min(
					D.state.pathSuggestions.selected + 1,
					D.state.pathSuggestions.items.length - 1,
				);
				fn.renderPathSuggestions();
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				D.state.pathSuggestions.selected = Math.max(D.state.pathSuggestions.selected - 1, 0);
				fn.renderPathSuggestions();
				return;
			}
			if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
				e.preventDefault();
				const item = D.state.pathSuggestions.items[D.state.pathSuggestions.selected];
				if (item) {
					fn.applyPathSuggestion(item);
				}
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				fn.hidePathSuggestions();
				return;
			}
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (D.state.busy && !D.state.userAskPending) {
				fn.tryEnqueueFromComposer();
				return;
			}
			if (!D.state.busy) {
				fn.doSend();
			}
			return;
		}

		if (e.key === 'Escape' && !fn.isPromptTextEmpty()) {
			e.preventDefault();
			fn.clearPromptText();
			D.state.references = [];
			fn.renderRefs();
			fn.hidePathSuggestions();
			fn.updatePromptPlaceholder();
		}
	});

	if (D.dom.exportTranscriptBtn) {
		D.dom.exportTranscriptBtn.addEventListener('click', () => {
			D.vscode.postMessage({ type: 'exportTranscript' });
		});
	}
	if (D.dom.historyToggleBtn) {
		D.dom.historyToggleBtn.addEventListener('click', () => fn.toggleHistory());
	}
	if (D.dom.historyCloseBtn) {
		D.dom.historyCloseBtn.addEventListener('click', () => fn.closeHistory());
	}
	if (D.dom.historyResetWorkspaceBtn) {
		D.dom.historyResetWorkspaceBtn.addEventListener('click', () => fn.resetWorkspace());
	}
	if (D.dom.newChatBtn) {
		D.dom.newChatBtn.addEventListener('click', () => fn.newChat());
	}
	if (D.dom.openSettingsBtn) {
		D.dom.openSettingsBtn.addEventListener('click', () => {
			D.vscode.postMessage({ type: 'openSettings' });
		});
	}
	if (D.dom.addRefsBtn) {
		D.dom.addRefsBtn.addEventListener('click', () => {
			D.vscode.postMessage({ type: 'pickReferences' });
		});
	}
	if (D.dom.revertLastRunBtn) {
		D.dom.revertLastRunBtn.addEventListener('click', () => {
			D.vscode.postMessage({ type: 'revertLastRun' });
		});
	}
	if (D.dom.stickyUserPromptEl) {
		D.dom.stickyUserPromptEl.addEventListener('click', () => {
			fn.scrollToUserPromptMessage();
		});
		D.dom.stickyUserPromptEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fn.scrollToUserPromptMessage();
			}
		});
	}




	window.addEventListener('message', (event) => {
		fn.handleHostMessage(event.data);
	});

	const syncViewportHeight = () => {
		const h = `${window.innerHeight}px`;
		document.documentElement.style.height = h;
		document.body.style.height = h;
	};
	syncViewportHeight();
	window.addEventListener('resize', syncViewportHeight);
	window.addEventListener('resize', () => fn.syncPromptInputHeight?.());

	if (D.dom.logEl) {
		D.dom.logEl.addEventListener(
			'scroll',
			() => {
				fn.syncLogStickToBottom?.();
			},
			{ passive: true },
		);
	}

	fn.initAgentVignettes();
	try {
		const legacy = localStorage.getItem(D.const.MODE_STORAGE_KEY);
		if (legacy) {
			if (legacy === 'professor') {
				D.vscode.postMessage({ type: 'setPermissionMode', permissionMode: 'professor' });
			} else if (D.const.VALID_MODES.has(legacy)) {
				fn.setPermissionMode(legacy, true);
			}
			localStorage.removeItem(D.const.MODE_STORAGE_KEY);
		}
	} catch {
		// ignore
	}
	fn.initLlmModelPicker();
	fn.initRoleModelVignettes();
	fn.initGeneralSettingsVignettes();
	fn.updateComposerChrome();
	fn.updatePromptPlaceholder();
	fn.syncPromptInputHeight?.();
	fn.renderRefs();
	fn.renderSessionTabs();
	fn.initSessionLazyHistory?.();
	if (typeof fn.bindChatVersionReleaseNotes === 'function') {
		fn.bindChatVersionReleaseNotes();
	}

	D.vscode.postMessage({ type: 'webviewReady' });
})(globalThis.DroxChat);
