/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Assistant stream state — fil linéaire uniquement.

(function (D) {
	const fn = D.fn;

	fn.finalizeAssistant = function () {
		if (D.state.assistantEl) {
			D.state.assistantEl.classList.remove('streaming');
			D.state.assistantEl = null;
		}
		if (D.state.chatStreamEl?.classList?.contains('streaming')) {
			D.state.chatStreamEl.classList.remove('streaming');
		}
	};

	fn.finalizeAssistantUnlessInExplore = function () {
		fn.finalizeAssistant();
	};

	fn.appendMessage = function (role, text) {
		const el = document.createElement('div');
		if (role === 'assistant') {
			el.className = 'msg assistant msg-ai-frame markdown';
			fn.setAssistantMarkdown(el, text || '');
			const answer =
				typeof fn.getRunSection === 'function' ? fn.getRunSection('answer') : null;
		const parent = answer || D.dom.logEl;
		if (parent === D.dom.logEl) {
			fn.appendToLog?.(el);
		} else {
			parent.appendChild(el);
		}
			D.state.assistantEl = el;
			fn.scrollLog();
			return el;
		}
		if (role === 'user') {
			const userEl = fn.renderUserMessage(text || '', [], [], []);
			fn.appendToLog?.(userEl);
			fn.pinLogToBottom?.();
			return userEl;
		}
		el.className = `msg ${role}`;
		if (role === 'error') {
			const textSpan = document.createElement('span');
			textSpan.className = 'msg-error-text';
			textSpan.textContent = text;
			el.appendChild(textSpan);
			fn.appendChatIssue?.(el, text);
			fn.attachErrorRetryAction?.(el);
			fn.scrollLog();
			return el;
		}
		el.textContent = text;
		fn.appendToLog?.(el);
		fn.scrollLog();
		return el;
	};
})(globalThis.DroxChat);
