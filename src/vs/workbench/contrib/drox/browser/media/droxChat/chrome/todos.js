/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.renderTodos = function(items) {
		if (!Array.isArray(items) || items.length === 0) {
			D.state.todoSnapshot = [];
			D.state.currentTodoBlockEl = null;
			fn.syncPlanStickyFooter?.();
			return;
		}
		if (
			D.state.busy &&
			typeof fn.beginLinearRunStrip === 'function' &&
			!D.state.linearRunUi
		) {
			fn.beginLinearRunStrip();
		}
		D.state.todoSnapshot = items.map((t) => ({
			id: String(t.id ?? ''),
			content: String(t.content ?? ''),
			status: String(t.status ?? 'pending'),
		}));
		fn.finalizeAssistant();

		let block = D.state.currentTodoBlockEl;
		const strip = D.state.runStripEl;
		if (strip?.isConnected) {
			for (const old of [...strip.querySelectorAll('.msg-todos')]) {
				if (old !== block) {
					old.remove();
				}
			}
		}
		for (const old of [...D.dom.logEl.querySelectorAll('.msg-todos')]) {
			if (old !== block && !old.closest('.drox-run-strip')) {
				old.remove();
			}
		}
		if (!block || !block.isConnected) {
			block = document.createElement('div');
			block.className = 'msg-todos';
			const head = document.createElement('div');
			head.className = 'todos-head';
			const headLeft = document.createElement('div');
			headLeft.className = 'todos-head-left';
			const listIcon = document.createElement('span');
			listIcon.className = 'todos-list-icon';
			listIcon.setAttribute('aria-hidden', 'true');
			const title = document.createElement('span');
			title.className = 'todos-title';
			title.textContent = 'Plan';
			headLeft.appendChild(listIcon);
			headLeft.appendChild(title);
			if (D.state.busy) {
				fn.ensurePersistentActivityGrid(headLeft);
			}
			head.appendChild(headLeft);
			const counter = document.createElement('span');
			counter.className = 'todos-counter';
			head.appendChild(counter);
			block.appendChild(head);
			const list = document.createElement('ul');
			list.className = 'todos-list';
			block.appendChild(list);
			const mount =
				typeof fn.ensurePlanMount === 'function'
					? fn.ensurePlanMount(D.state.runStripEl)
					: typeof fn.ensureChronologySection === 'function'
						? fn.ensureChronologySection(D.state.runStripEl)
						: typeof fn.getChronologyMount === 'function'
							? fn.getChronologyMount()
							: null;
			if (mount) {
				mount.appendChild(block);
			}
			D.state.currentTodoBlockEl = block;
			fn.syncPlanStickyFooter?.();
		}
		const headLeft = block.querySelector('.todos-head-left');
		if (headLeft) {
			if (D.state.busy) {
				fn.ensurePersistentActivityGrid(headLeft);
			} else {
				fn.stripActivityGridsFromElement?.(headLeft);
			}
		}
		if (typeof fn.reparentTodoBlockToPlan === 'function') {
			fn.reparentTodoBlockToPlan();
		}
		fn.syncPlanStickyFooter?.();
		if (typeof fn.ensureRunStripConnected === 'function' && D.state.runStripEl) {
			fn.ensureRunStripConnected(D.state.runStripEl);
		}

		const counter = block.querySelector('.todos-counter');
		const list = block.querySelector('.todos-list');
		const doneCount = items.filter((t) => t.status === 'completed').length;
		if (counter) {
			counter.textContent = `${doneCount}/${items.length}`;
		}
		if (list) {
			list.innerHTML = '';
			for (const t of items) {
				const meta = D.const.TODO_STATUS_META[t.status] || D.const.TODO_STATUS_META.pending;
				const li = document.createElement('li');
				const subStep =
					/^\s*(?:\d+[\.\)]\s*[-–—]?\s*|\d+[\.\)]\s+|partie\s+\d|part\s+\d|•\s+)/i.test(
						t.content,
					);
				li.className = `todo-item ${meta.cls}${subStep ? ' todo-sub' : ''}`;
				li.dataset.id = t.id;
				const ic = document.createElement('span');
				ic.className = 'todo-ic';
				ic.setAttribute('title', meta.label);
				ic.setAttribute('aria-hidden', 'true');
				const txt = document.createElement('span');
				txt.className = 'todo-text';
				txt.textContent = t.content;
				li.appendChild(ic);
				li.appendChild(txt);
				list.appendChild(li);
			}
		}
		fn.syncStickyStackLayout?.();
		fn.syncWorkSummaryStats?.(D.state.runStripEl);
		fn.scrollLog();
		if (D.state.busy) {
			fn.showActivityOnCurrentPhaseSummary();
		}
	}
})(globalThis.DroxChat);
