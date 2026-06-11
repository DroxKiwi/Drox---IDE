/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.abortRunLocally = function() {
		D.state.pendingTodoUpdates = null;
		D.state.orchestrationRole = null;
		D.state.pendingToolName = '';
		fn.setBusy(false);
		fn.finalizeAssistant();
		fn.closeCurrentPhase();
		D.state.toolBlocks.clear();
		fn.flushPendingPromptQueue();
		D.dom.statusEl.textContent = 'Stopping…';
	}
})(globalThis.DroxChat);
