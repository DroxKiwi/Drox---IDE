/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	let activeRecoveryMessageId = null;

	fn.attachErrorRetryAction = function (errorEl) {
		if (!errorEl || D.state.uiReplayActive) {
			return;
		}
		const messageId = activeRecoveryMessageId
			|| fn.findLastUserMessageRow?.()?.dataset?.msgId
			|| '';
		if (!messageId) {
			return;
		}
		if (errorEl.querySelector('.msg-error-retry')) {
			return;
		}
		errorEl.classList.add('msg-error-with-retry');
		const retryBtn = document.createElement('button');
		retryBtn.type = 'button';
		retryBtn.className = 'msg-error-retry';
		retryBtn.textContent = 'Retry';
		retryBtn.title = 'Clear the error and re-run the last user message';
		retryBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			D.vscode.postMessage({ type: 'restartRunAfterError', messageId });
		});
		errorEl.appendChild(retryBtn);
	};

	fn.findUserRowByMessageId = function (messageId) {
		const id = String(messageId || '').trim();
		if (!id || !D.dom.logEl) {
			return null;
		}
		for (const row of fn.queryUserMessageRows(D.dom.logEl)) {
			if (row.dataset.msgId === id) {
				return row;
			}
		}
		return null;
	};

	fn.syncRunRecoveryButtonState = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		const busy = Boolean(D.state.busy);
		for (const resumeBtn of log.querySelectorAll('.msg-user-recovery-resume')) {
			resumeBtn.disabled = busy;
			resumeBtn.title = busy
				? 'Attendre la fin du run ou utiliser Recommencer'
				: 'Reprendre depuis la dernière coupure';
		}
		for (const restartBtn of log.querySelectorAll('.msg-user-recovery-restart')) {
			restartBtn.disabled = false;
			restartBtn.title = busy
				? 'Arrêter le run en cours et relancer depuis ce message'
				: 'Effacer la réponse du modèle et relancer';
		}
	};

	fn.dismissRunRecoveryActions = function () {
		activeRecoveryMessageId = null;
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		for (const btn of log.querySelectorAll('.msg-user-recovery')) {
			btn.remove();
		}
		for (const row of log.querySelectorAll('.msg-row-user[data-run-recovery-active="1"]')) {
			row.removeAttribute('data-run-recovery-active');
		}
	};

	fn.attachRunRecoveryActions = function (row, messageId) {
		if (!row) {
			return;
		}
		const id = String(messageId || '').trim();
		if (
			activeRecoveryMessageId === id
			&& row.dataset.runRecoveryActive === '1'
			&& row.querySelector('.msg-user-recovery')
		) {
			fn.syncRunRecoveryButtonState();
			return;
		}
		fn.dismissRunRecoveryActions();
		activeRecoveryMessageId = id || null;
		row.dataset.runRecoveryActive = '1';

		let toolbar = row.querySelector('.msg-user-toolbar');
		if (!toolbar) {
			toolbar = document.createElement('div');
			toolbar.className = 'msg-user-toolbar';
			row.insertBefore(toolbar, row.firstChild);
		}

		for (const old of toolbar.querySelectorAll('.msg-user-recovery')) {
			old.remove();
		}

		const resumeBtn = document.createElement('button');
		resumeBtn.type = 'button';
		resumeBtn.className = 'msg-user-recovery msg-user-recovery-resume';
		resumeBtn.textContent = 'Reprendre';
		resumeBtn.title = 'Reprendre depuis la dernière coupure';
		resumeBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (D.state.busy) {
				return;
			}
			D.vscode.postMessage({ type: 'resumeRunAfterError', messageId });
		});

		const restartBtn = document.createElement('button');
		restartBtn.type = 'button';
		restartBtn.className = 'msg-user-recovery msg-user-recovery-restart';
		restartBtn.textContent = 'Recommencer';
		restartBtn.title = 'Effacer la réponse du modèle et relancer';
		restartBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			D.vscode.postMessage({ type: 'restartRunAfterError', messageId });
		});

		toolbar.appendChild(resumeBtn);
		toolbar.appendChild(restartBtn);
		fn.syncRunRecoveryButtonState();
	};

	fn.clearLogAfterUserMessage = function (messageId) {
		const row = fn.findUserRowByMessageId(messageId);
		if (!row || !D.dom.logEl) {
			return;
		}
		const anchor = fn.resolveUserMessageAnchor(row);
		if (!anchor) {
			return;
		}
		let sibling = anchor.nextElementSibling;
		while (sibling) {
			const next = sibling.nextElementSibling;
			sibling.remove();
			sibling = next;
		}
		fn.resetChatStreamForTurn?.();
		fn.finalizeAssistant?.();
		fn.closeCurrentPhase?.();
		fn.closeActivePhaseBlock?.();
		fn.collapseRunWorkSection?.();
		fn.hideAgentActivitySticky?.();
		D.state.toolBlocks?.clear?.();
	};

	fn.findLastUserMessageRow = function () {
		const rows = fn.queryUserMessageRows(D.dom.logEl);
		return rows.length > 0 ? rows[rows.length - 1] : null;
	};

	fn.offerRunRecoveryOnUserMessage = function (messageId) {
		if (D.state.uiReplayActive) {
			return;
		}
		const id = String(messageId || '').trim();
		let row = fn.findUserRowByMessageId(id);
		if (!row) {
			row = fn.findLastUserMessageRow();
			if (row && id) {
				row.dataset.msgId = id;
			}
		}
		if (row) {
			fn.attachRunRecoveryActions(row, id || row.dataset.msgId);
		} else if (id) {
			activeRecoveryMessageId = id;
		}
		const log = D.dom.logEl;
		if (log) {
			const errors = log.querySelectorAll('.msg.error');
			const lastError = errors.length > 0 ? errors[errors.length - 1] : null;
			if (lastError) {
				fn.attachErrorRetryAction?.(lastError);
			}
		}
	};

	fn.reapplyRunRecoveryActionsIfNeeded = function () {
		if (!activeRecoveryMessageId || D.state.uiReplayActive) {
			return;
		}
		let row = fn.findUserRowByMessageId(activeRecoveryMessageId);
		if (!row) {
			row = fn.findLastUserMessageRow();
			if (row) {
				row.dataset.msgId = activeRecoveryMessageId;
			}
		}
		if (row && !row.querySelector('.msg-user-recovery')) {
			fn.attachRunRecoveryActions(row, activeRecoveryMessageId);
		} else {
			fn.syncRunRecoveryButtonState();
		}
	};

})(globalThis.DroxChat);
