/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fil lineaire append-only : plan, work, thinking, answer (pas de promotion Exploring).

(function (D) {
	const fn = D.fn;
	fn.tagAssistantWithActiveStrip = function (el) {
		if (!el || !D.state.runStripEl) {
			return;
		}
		if (!D.state.runStripEl.dataset.stripId) {
			D.state.runStripEl.dataset.stripId = fn.nextRunStripId();
		}
		el.dataset.runStripId = D.state.runStripEl.dataset.stripId;
	};

	fn.ensureAssistantInRunAnswer = function () {
		const answer = fn.getRunSection('answer');
		if (!answer || !D.state.assistantEl) {
			return false;
		}
		const activeId = D.state.runStripEl?.dataset?.stripId || '';
		const elStripId = String(D.state.assistantEl.dataset?.runStripId || '').trim();
		if (elStripId && activeId && elStripId !== activeId) {
			D.state.assistantEl = null;
			return false;
		}
		fn.tagAssistantWithActiveStrip(D.state.assistantEl);
		if (D.state.assistantEl.parentElement !== answer) {
			answer.appendChild(D.state.assistantEl);
		}
		return true;
	};
})(globalThis.DroxChat);
