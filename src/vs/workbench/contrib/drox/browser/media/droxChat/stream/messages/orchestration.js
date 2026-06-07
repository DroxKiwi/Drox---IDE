/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.appendSubagentBadge = function (parent, text, className) {
		const b = document.createElement('span');
		b.className = `subagent-badge ${className}`;
		b.textContent = text;
		parent.appendChild(b);
	};

	fn.mountSubagentCard = function (el) {
		D.dom.logEl.appendChild(el);
		fn.scrollLog();
	};

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
		if (r !== 'architect' && r !== 'executor') {
			return;
		}
		if (r === 'executor') {
			return;
		}
		const el = document.createElement('div');
		el.className = `msg-orchestration-role msg-orchestration-${r}`;
		el.setAttribute('role', 'status');
		const label = r === 'architect' ? 'Architect' : 'Executor';
		el.textContent =
			r === 'architect'
				? `${label} — planning and delegation`
				: `${label} — running task`;
		D.dom.logEl.appendChild(el);
		fn.scrollLog();
	};
})(globalThis.DroxChat);
