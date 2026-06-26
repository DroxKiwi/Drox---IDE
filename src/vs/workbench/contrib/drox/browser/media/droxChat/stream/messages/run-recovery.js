/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

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

	fn.dismissRunRecoveryActions = function () {
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
		fn.dismissRunRecoveryActions();
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
			fn.dismissRunRecoveryActions();
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
			fn.dismissRunRecoveryActions();
			D.vscode.postMessage({ type: 'restartRunAfterError', messageId });
		});

		toolbar.appendChild(resumeBtn);
		toolbar.appendChild(restartBtn);
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

	fn.offerRunRecoveryOnUserMessage = function (messageId) {
		if (D.state.uiReplayActive) {
			return;
		}
		const row = fn.findUserRowByMessageId(messageId);
		if (row) {
			fn.attachRunRecoveryActions(row, messageId);
		}
	};

})(globalThis.DroxChat);
