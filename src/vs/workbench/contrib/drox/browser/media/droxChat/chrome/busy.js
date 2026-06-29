/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.setBusy = function(next) {
		D.state.busy = next;
		if (next) {
			fn.syncLogStickToBottom?.();
			D.state.pendingRunWarmup = false;
		}
		D.dom.progressEl.classList.toggle('busy', next);
		fn.updateComposerChrome();
		fn.updateRunRevertButton();
		fn.reapplyRunRecoveryActionsIfNeeded?.();
		fn.updateAgentActivitySticky();
		if (D.dom.llmModelPickerEl && !D.state.llmModelsLoading) {
			fn.renderLlmModelPicker();
		}
		if (!next) {
			if (typeof fn.freezeCycleTimer === 'function') {
				fn.freezeCycleTimer();
			}
			fn.hideActivity();
			fn.hideArchitectRunTailActivity();
			fn.clearPersistentActivityGrids(D.dom.logEl);
		}
		if (!D.state.userAskPending) {
			if (D.state.compactBusy) {
				D.dom.statusEl.textContent = 'Compacting…';
			} else {
				D.dom.statusEl.textContent = next ? 'Run in progress…' : 'Ready';
			}
		}
		if (next) {
			fn.refreshActivityIndicator();
			fn.startRunActivityWatchdog?.();
		}
		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
	}
})(globalThis.DroxChat);
