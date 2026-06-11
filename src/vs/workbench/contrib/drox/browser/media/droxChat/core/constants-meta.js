/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	D.const.DEFAULT_SESSION_TAB_TITLE = 'New chat';
	D.state.openTabs = [];
	D.state.activeTabId = null;
	D.state.currentSessionId = null;
	D.state.totalIn = 0;
	D.state.totalOut = 0;
	D.state.ctxTokens = 0;
	D.state.cycleStartedAt = null;
	D.state.cycleFrozenMs = null;
	D.state.cycleTimerId = null;
	D.const.PHASE_META = {
		reasoning: { label: 'Reasoning' },
		internal_reasoning: { label: 'Native reasoning' },
		analyzing: { label: 'Analyzing repository' },
		reading: { label: 'Reading' },
		clarifying: { label: 'Clarifying' },
		planning: { label: 'Planning' },
		'next-move': { label: 'Next move' },
		acting: { label: 'Acting' },
		testing: { label: 'Testing' },
		verifying: { label: 'Verifying' },
		answering: { label: 'Answering' },
		done: { label: 'Done' },
	};
	D.const.TODO_STATUS_META = {
		pending: { label: 'To do', cls: 'todo-pending' },
		in_progress: { label: 'In progress', cls: 'todo-progress' },
		completed: { label: 'Done', cls: 'todo-done' },
		cancelled: { label: 'Cancelled', cls: 'todo-cancel' },
	};
	D.const.SESSION_TAB_ANIM_MS = 220;
})(globalThis.DroxChat);
