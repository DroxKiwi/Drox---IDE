/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.highlightTodoTask = function (taskId, statusHint) {
		const id = String(taskId || '').trim();
		if (!id || !D.state.currentTodoBlockEl) {
			return;
		}
		for (const li of D.state.currentTodoBlockEl.querySelectorAll('.todo-item')) {
			li.classList.remove('todo-active');
			if (li.dataset.id === id) {
				li.classList.add('todo-active');
				if (statusHint === 'running') {
					li.classList.add('todo-progress');
				}
			}
		}
	};

	fn.renderOrchestrationRole = function (role) {
		const r = String(role || '').trim().toLowerCase();
		if (r === 'architect_discussion') {
			fn.beginDiscussionRunPresentation?.();
			fn.ensureLinearThinkingShell?.();
			return;
		}
		if (r !== 'architect') {
			return;
		}
		const el = document.createElement('div');
		el.className = 'msg-orchestration-role msg-orchestration-architect';
		el.setAttribute('role', 'status');
		el.textContent = 'Architect — edit run';
		D.dom.logEl.appendChild(el);
		fn.scrollLog();
	};
})(globalThis.DroxChat);
