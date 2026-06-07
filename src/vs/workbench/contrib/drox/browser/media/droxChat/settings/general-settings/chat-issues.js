/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	const CHAT_ISSUE_SELECTORS =
		'.msg.error, .msg-explore-notice, .msg-loop-intervention-warn, .msg-loop-intervention-abort, .msg-tool.error, .executor-action-line.error, .drox-explore-line.error, .msg-subagent-failed, .msg-subagent-partial';

	fn.isChatErrorsWarningsVisible = function () {
		return D.state.generalSettings?.showChatErrorsAndWarnings !== false;
	};

	fn.markChatIssueElement = function (el) {
		if (!el || fn.isChatErrorsWarningsVisible()) {
			return;
		}
		el.classList.add('drox-chat-issue-hidden');
	};

	fn.syncChatErrorsWarningsVisibility = function () {
		const show = fn.isChatErrorsWarningsVisible();
		const roots = [D.dom.logEl].filter(Boolean);
		for (const root of roots) {
			for (const el of root.querySelectorAll(CHAT_ISSUE_SELECTORS)) {
				if (el.closest('.msg-todos, [data-section="plan"] .msg-todos')) {
					continue;
				}
				el.classList.toggle('drox-chat-issue-hidden', !show);
			}
			for (const tray of root.querySelectorAll(
				'.drox-explore-issues-tray, .drox-log-issues-tray',
			)) {
				tray.classList.toggle('drox-chat-issue-hidden', !show);
			}
		}
		if (D.state.exploreMetaTrayEl) {
			const hasVisibleIssue =
				show &&
				Boolean(D.state.exploreIssuesTray?.trayEl?.isConnected && !D.state.exploreIssuesTray.trayEl.hidden);
			D.state.exploreMetaTrayEl.classList.toggle('drox-meta-has-issues', hasVisibleIssue);
		}
	};
})(globalThis.DroxChat);
