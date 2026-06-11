/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.relativeTime = function(secs) {
		if (!secs) {
			return '—';
		}
		const diff = Date.now() / 1000 - secs;
		if (diff < 60) {
			return 'just now';
		}
		if (diff < 3600) {
			return `${Math.floor(diff / 60)} min ago`;
		}
		if (diff < 86400) {
			return `${Math.floor(diff / 3600)} h ago`;
		}
		if (diff < 86400 * 7) {
			return `${Math.floor(diff / 86400)} d ago`;
		}
		return new Date(secs * 1000).toLocaleDateString();
	}

	fn.formatBytes = function(n) {
		if (!n) {
			return '0 B';
		}
		if (n < 1024) {
			return `${n} B`;
		}
		if (n < 1024 * 1024) {
			return `${(n / 1024).toFixed(1)} KB`;
		}
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}

	fn.openHistory = function() {
		if (!D.dom.historyPanel) {
			return;
		}
		D.dom.historyPanel.classList.add('open');
		D.dom.historyPanel.setAttribute('aria-hidden', 'false');
		D.vscode.postMessage({ type: 'listSessions' });
	}

	fn.closeHistory = function() {
		if (!D.dom.historyPanel) {
			return;
		}
		D.dom.historyPanel.classList.remove('open');
		D.dom.historyPanel.setAttribute('aria-hidden', 'true');
	}

	fn.toggleHistory = function() {
		if (!D.dom.historyPanel) {
			return;
		}
		if (D.dom.historyPanel.classList.contains('open')) {
			fn.closeHistory();
		} else {
			fn.openHistory();
		}
	}

	fn.newChat = function() {
		fn.closeHistory();
		D.vscode.postMessage({ type: 'newChat' });
		D.dom.promptEl.focus();
	}

	fn.resetWorkspace = function() {
		fn.closeHistory();
		D.vscode.postMessage({ type: 'resetWorkspace' });
	}

	fn.renderHistory = function(payload) {
		if (!D.dom.historyList) {
			return;
		}
		D.dom.historyList.replaceChildren();
		if (payload.error) {
			const err = document.createElement('div');
			err.className = 'history-error';
			err.textContent = payload.error;
			D.dom.historyList.appendChild(err);
			return;
		}
		const items = Array.isArray(payload.items) ? payload.items : [];
		if (typeof payload.currentId === 'string') {
			D.state.currentSessionId = payload.currentId;
		}
		if (items.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'history-empty';
			empty.textContent = 'No saved conversations yet.';
			D.dom.historyList.appendChild(empty);
			return;
		}
		for (const it of items) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'history-item';
			if (it.id === D.state.currentSessionId) {
				btn.classList.add('current');
			}
			const title = document.createElement('span');
			title.className = 'title';
			const label = typeof it.title === 'string' && it.title.trim()
				? it.title.trim()
				: 'Untitled chat';
			title.textContent = label;
			title.title = typeof it.title === 'string' && it.title.trim()
				? `${label}\n${it.id}`
				: it.id;
			const meta = document.createElement('span');
			meta.className = 'meta';
			const when = document.createElement('span');
			when.textContent = fn.relativeTime(it.modifiedSecs);
			const size = document.createElement('span');
			size.className = 'size';
			size.textContent = fn.formatBytes(it.sizeBytes);
			meta.appendChild(when);
			meta.appendChild(size);
			btn.appendChild(title);
			btn.appendChild(meta);
			btn.addEventListener('click', () => {
				fn.closeHistory();
				D.vscode.postMessage({ type: 'loadSession', sessionId: it.id });
			});
			D.dom.historyList.appendChild(btn);
		}
	}

	fn.formatTokens = function(n) {
		if (!n) {
			return '0';
		}
		if (n < 1000) {
			return String(n);
		}
		return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
	}

	fn.formatCycleElapsed = function (ms) {
		const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
		const h = Math.floor(totalSec / 3600);
		const m = Math.floor((totalSec % 3600) / 60);
		const s = totalSec % 60;
		const pad = (n) => String(n).padStart(2, '0');
		return `${pad(h)}:${pad(m)}:${pad(s)}`;
	};

	fn.stopCycleTimerInterval = function () {
		if (D.state.cycleTimerId != null) {
			clearInterval(D.state.cycleTimerId);
			D.state.cycleTimerId = null;
		}
	};

	fn.renderCycleTimer = function () {
		if (!D.dom.statCycleEl) {
			return;
		}
		let ms = 0;
		if (D.state.cycleFrozenMs != null) {
			ms = D.state.cycleFrozenMs;
		} else if (D.state.cycleStartedAt != null) {
			ms = Date.now() - D.state.cycleStartedAt;
		}
		D.dom.statCycleEl.textContent = fn.formatCycleElapsed(ms);
	};

	fn.resetCycleTimer = function () {
		fn.stopCycleTimerInterval();
		D.state.cycleStartedAt = Date.now();
		D.state.cycleFrozenMs = null;
		fn.renderCycleTimer();
		D.state.cycleTimerId = setInterval(() => fn.renderCycleTimer(), 1000);
	};

	fn.freezeCycleTimer = function () {
		if (D.state.cycleStartedAt == null || D.state.cycleFrozenMs != null) {
			return;
		}
		D.state.cycleFrozenMs = Date.now() - D.state.cycleStartedAt;
		fn.stopCycleTimerInterval();
		fn.renderCycleTimer();
	};

	fn.clearCycleTimer = function () {
		fn.stopCycleTimerInterval();
		D.state.cycleStartedAt = null;
		D.state.cycleFrozenMs = null;
		fn.renderCycleTimer();
	};

	fn.renderStatus = function() {
		if (D.dom.statTokensIn) {
			D.dom.statTokensIn.textContent = String(D.state.totalIn);
		}
		if (D.dom.statTokensOut) {
			D.dom.statTokensOut.textContent = String(D.state.totalOut);
		}
		if (D.dom.statCtx) {
			D.dom.statCtx.textContent = fn.formatTokens(D.state.ctxTokens);
		}
	}

	fn.resetChatUi = function() {
		D.dom.logEl.innerHTML = '';
		D.state.currentSessionId = null;
		D.state.totalIn = 0;
		D.state.totalOut = 0;
		D.state.ctxTokens = 0;
		fn.clearCycleTimer();
		fn.renderStatus();
		D.state.assistantEl = null;
		D.state.currentPhase = null;
		D.state.currentPhaseEl = null;
		D.state.currentPhaseBodyEl = null;
		fn.resetCollapsibleTrayState?.();
		D.state.toolBlocks.clear();
		D.state.currentTodoBlockEl = null;
		D.state.todoSnapshot = [];
		fn.hideActivity();
		D.state.pendingPrompts = [];
		fn.renderPendingPrompts();
		D.state.attachments = [];
		D.state.references = [];
		D.state.pasteAttachments = [];
		D.state.pasteCandidates.clear();
		fn.renderAttachments();
		fn.clearPromptText();
		fn.renderRefs();
		fn.hidePathSuggestions();
		fn.updatePromptPlaceholder();
		fn.hideRunObjectiveSticky();
		D.state.pendingTodoUpdates = null;
		D.state.uiReplayActive = false;
		fn.resetSessionLazyHistory?.();
		D.state.linearRunUi = false;
		D.state.discussionRunActive = false;
		D.state.discussionAwaitingCanonicalReply = false;
		D.state.runStripEl = null;
		D.state.runStripCommitted = false;
		D.state.chatStreamEl = null;
		D.state.chatStreamStripId = '';
		fn.hideAgentActivitySticky();
		D.state.logStickToBottom = true;
		if (D.state.pendingUserAsk) {
			fn.closeUserAskCard();
		}
		fn.setBusy(false);
	}
})(globalThis.DroxChat);
