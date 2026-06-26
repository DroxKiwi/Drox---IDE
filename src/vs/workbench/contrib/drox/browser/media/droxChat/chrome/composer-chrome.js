/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.updateSendActionButton = function() {
		if (!D.dom.sendBtn) {
			return;
		}
		const runActive = D.state.busy || D.state.pendingRunWarmup;
		D.dom.sendBtn.classList.toggle('is-run-active', runActive);
		if (D.dom.sendActionIconSend) {
			D.dom.sendActionIconSend.hidden = runActive;
		}
		if (D.dom.sendActionIconStop) {
			D.dom.sendActionIconStop.hidden = !runActive;
		}
		if (D.state.userAskPending && !D.state.busy) {
			D.dom.sendBtn.disabled = true;
			D.dom.sendBtn.title = 'Answer the questions or click Skip to continue';
			D.dom.sendBtn.setAttribute('aria-label', D.dom.sendBtn.title);
		} else if (D.state.compactBusy) {
			D.dom.sendBtn.disabled = true;
			D.dom.sendBtn.title = 'Compacting transcript…';
			D.dom.sendBtn.setAttribute('aria-label', D.dom.sendBtn.title);
		} else if (runActive) {
			D.dom.sendBtn.disabled = false;
			D.dom.sendBtn.title = 'Stop conversation';
			D.dom.sendBtn.setAttribute('aria-label', 'Stop conversation');
		} else {
			D.dom.sendBtn.disabled = false;
			D.dom.sendBtn.title = 'Send (Enter)';
			D.dom.sendBtn.setAttribute('aria-label', 'Send');
		}
	}

	fn.updateComposerChrome = function() {
		fn.updateSendActionButton();

		const q = D.state.pendingPrompts.length;
		if (D.dom.sendQueueBadge) {
			if (D.state.busy && q > 0) {
				D.dom.sendQueueBadge.hidden = false;
				D.dom.sendQueueBadge.removeAttribute('aria-hidden');
				D.dom.sendQueueBadge.textContent = `+${q}`;
			} else {
				D.dom.sendQueueBadge.hidden = true;
				D.dom.sendQueueBadge.setAttribute('aria-hidden', 'true');
				D.dom.sendQueueBadge.textContent = '';
			}
		}
	}

	fn.setCompactBusy = function(active) {
		D.state.compactBusy = active;
		D.dom.progressEl.classList.toggle('compact', active);
		fn.updateComposerChrome();
		if (!D.state.userAskPending && !D.state.busy) {
			D.dom.statusEl.textContent = active ? 'Compacting…' : 'Ready';
		}
		// Indicateur persistant : texte seul (grille réservée à la phrase warmup du fil).
		if (active && D.dom.statusEl) {
			fn.ensureTailWarmupActivity?.();
		}
	}

	fn.updateRunRevertButton = function() {
		if (!D.dom.revertLastRunBtn) {
			return;
		}
		const show = D.state.runRevertAvailable && !D.state.busy && D.state.runRevertFileCount > 0;
		D.dom.revertLastRunBtn.hidden = !show;
		D.dom.revertLastRunBtn.disabled = !show;
		if (show) {
			const n = D.state.runRevertFileCount;
			D.dom.revertLastRunBtn.title =
				n === 1 ? 'Revert 1 file from the last run' : `Revert ${n} files from the last run`;
		}
	};

})(globalThis.DroxChat);
