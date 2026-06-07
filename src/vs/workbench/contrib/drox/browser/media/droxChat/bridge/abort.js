/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.abortRunLocally = function() {
		D.state.activeSubagentCount = 0;
		D.state.subagentJobCards.clear();
		D.state.executorCaptures?.clear();
		D.state.executorActiveJobId = null;
		D.state.executorCaptureJobId = null;
		D.state.activeExecutorJobIds.clear();
		D.state.executorCaptureToolsEl = null;
		D.state.executorCaptureThinkingEl = null;
		D.state.executorCaptureReportEl = null;
		D.state.pendingExecutorThinking = null;
		D.state.pendingExecutorThinkingByJob?.clear();
		D.state.executorActionRailEl = null;
		D.state.executorActionRailSummaryEl = null;
		D.state.executorActionRailListEl = null;
		D.state.executorActionLineCount = 0;
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
