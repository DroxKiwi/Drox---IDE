/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.randomId = function() {
		return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	}

	fn.updateSendActionButton = function() {
		if (!D.dom.sendBtn) {
			return;
		}
		D.dom.sendBtn.classList.toggle('is-run-active', D.state.busy);
		if (D.dom.sendActionIconSend) {
			D.dom.sendActionIconSend.hidden = D.state.busy;
		}
		if (D.dom.sendActionIconStop) {
			D.dom.sendActionIconStop.hidden = !D.state.busy;
		}
		if (D.state.userAskPending && !D.state.busy) {
			D.dom.sendBtn.disabled = true;
			D.dom.sendBtn.title = 'Answer the questions or click Skip to continue';
			D.dom.sendBtn.setAttribute('aria-label', D.dom.sendBtn.title);
		} else if (D.state.compactBusy) {
			D.dom.sendBtn.disabled = true;
			D.dom.sendBtn.title = 'Compacting transcript…';
			D.dom.sendBtn.setAttribute('aria-label', D.dom.sendBtn.title);
		} else if (D.state.busy) {
			D.dom.sendBtn.disabled = false;
			D.dom.sendBtn.title = 'Stop conversation';
			D.dom.sendBtn.setAttribute('aria-label', 'Stop conversation');
		} else {
			D.dom.sendBtn.disabled = false;
			D.dom.sendBtn.title = 'Send (Enter)';
			D.dom.sendBtn.setAttribute('aria-label', 'Send');
		}
	}

	fn.updateComposerChrome = function() {
		fn.updateSendActionButton();

		const q = D.state.pendingPrompts.length;
		if (D.dom.sendQueueBadge) {
			if (D.state.busy && q > 0) {
				D.dom.sendQueueBadge.hidden = false;
				D.dom.sendQueueBadge.removeAttribute('aria-hidden');
				D.dom.sendQueueBadge.textContent = `+${q}`;
			} else {
				D.dom.sendQueueBadge.hidden = true;
				D.dom.sendQueueBadge.setAttribute('aria-hidden', 'true');
				D.dom.sendQueueBadge.textContent = '';
			}
		}
	}

	fn.setCompactBusy = function(active) {
		D.state.compactBusy = active;
		D.dom.progressEl.classList.toggle('compact', active);
		fn.updateComposerChrome();
		if (!D.state.userAskPending && !D.state.busy) {
			D.dom.statusEl.textContent = active ? 'Compacting…' : 'Ready';
		}
		// Indicateur persistant : ne pas donner l'impression d'un arrêt pendant la compaction.
		if (active && D.dom.statusEl) {
			fn.ensurePersistentActivityGrid(D.dom.statusEl);
		} else if (!active && D.dom.statusEl) {
			const grid = D.dom.statusEl.querySelector(':scope > .activity-grid.activity-grid-persistent');
			if (grid) {
				grid.remove();
			}
		}
	}

	fn.updateRunRevertButton = function() {
		if (!D.dom.revertLastRunBtn) {
			return;
		}
		const show = D.state.runRevertAvailable && !D.state.busy && D.state.runRevertFileCount > 0;
		D.dom.revertLastRunBtn.hidden = !show;
		D.dom.revertLastRunBtn.disabled = !show;
		if (show) {
			const n = D.state.runRevertFileCount;
			D.dom.revertLastRunBtn.title =
				n === 1 ? 'Revert 1 file from the last run' : `Revert ${n} files from the last run`;
		}
	};

	/** Met à jour le libellé d’un `<summary class="phase-summary">` sans retirer la grille d’activité. */
	fn.ensurePhaseSummaryLabel = function(summaryEl) {
		if (!summaryEl) {
			return null;
		}
		let label = summaryEl.querySelector('.phase-summary-label');
		if (label) {
			return label;
		}
		const grid = summaryEl.querySelector('.activity-grid-inline');
		let text = '';
		for (const node of summaryEl.childNodes) {
			if (node === grid) {
				continue;
			}
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || '';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				text += node.textContent || '';
			}
		}
		summaryEl.textContent = '';
		if (grid) {
			summaryEl.appendChild(grid);
		}
		label = document.createElement('span');
		label.className = 'phase-summary-label';
		label.textContent = text.trim();
		summaryEl.appendChild(label);
		return label;
	}

	fn.setPhaseSummaryLabel = function(summaryEl, text) {
		const label = fn.ensurePhaseSummaryLabel(summaryEl);
		if (label) {
			label.textContent = text;
		}
	}

	/** Run linéaire architecte : un seul indicateur en bas du strip (signal « ça tourne »). */
	fn.shouldUseArchitectRunTailActivity = function() {
		return Boolean(
			D.state.busy &&
			D.state.linearRunUi &&
			D.state.orchestrationRole === 'architect' &&
			D.state.runStripEl?.isConnected,
		);
	};

	fn.hideInlineActivityOnly = function() {
		if (D.state.currentWarmupRowEl) {
			D.state.currentWarmupRowEl.remove();
			D.state.currentWarmupRowEl = null;
		}
		if (D.state.currentActivityGridEl) {
			D.state.currentActivityGridEl.remove();
			D.state.currentActivityGridEl = null;
		}
	};

	fn.hideArchitectRunTailActivity = function() {
		if (D.state.architectTailActivityEl) {
			D.state.architectTailActivityEl.remove();
			D.state.architectTailActivityEl = null;
		}
	};

	fn.ensureArchitectRunTailActivity = function(opts) {
		if (!fn.shouldUseArchitectRunTailActivity()) {
			fn.hideArchitectRunTailActivity();
			return;
		}
		const strip = D.state.runStripEl;
		fn.hideInlineActivityOnly();
		let row = D.state.architectTailActivityEl;
		const rotatePhrase = opts?.rotatePhrase === true;
		if (!row || !row.isConnected) {
			row = document.createElement('div');
			row.className = 'activity-warmup drox-architect-tail-activity';
			row.setAttribute('role', 'status');
			row.setAttribute('aria-live', 'polite');
			row.appendChild(fn.buildActivityGrid());
			const label = document.createElement('span');
			label.className = 'activity-warmup-label';
			label.textContent = fn.pickWarmupPhrase();
			row.appendChild(label);
			D.state.architectTailActivityEl = row;
		} else if (rotatePhrase) {
			const label = row.querySelector('.activity-warmup-label');
			if (label) {
				label.textContent = fn.pickWarmupPhrase();
			}
		}
		strip.appendChild(row);
		fn.scrollLog();
	};

	fn.touchArchitectRunTailActivity = function(opts) {
		if (!fn.shouldUseArchitectRunTailActivity()) {
			return;
		}
		fn.ensureArchitectRunTailActivity(opts);
	};

	/** Réaffiche la grille 3×3 au bon endroit pendant un run actif. */
	fn.refreshActivityIndicator = function() {
		if (!D.state.busy) {
			return;
		}
		if (fn.shouldUseArchitectRunTailActivity()) {
			fn.ensureArchitectRunTailActivity();
			return;
		}
		if (D.state.exploreBundleEl?.classList.contains('streaming') && D.state.exploreSummaryEl) {
			fn.showActivityOnSummary(D.state.exploreSummaryEl);
			return;
		}
		if (D.state.currentPhaseEl) {
			fn.showActivityOnCurrentPhaseSummary();
			return;
		}
		if (D.state.assistantEl?.classList.contains('streaming') && D.state.assistantEl.isConnected) {
			fn.showActivityBeforeNode(D.state.assistantEl);
			return;
		}
		fn.showWarmupActivity();
	}

	fn.setBusy = function(next) {
		D.state.busy = next;
		if (next) {
			D.state.logStickToBottom = true;
			D.state.runHasFinalAnswer = false;
		}
		D.dom.progressEl.classList.toggle('busy', next);
		fn.updateComposerChrome();
		fn.updateRunRevertButton();
		fn.updateAgentActivitySticky();
		if (D.dom.llmModelPickerEl && !D.state.llmModelsLoading) {
			fn.renderLlmModelPicker();
		}
		if (!next) {
			if (typeof fn.freezeCycleTimer === 'function') {
				fn.freezeCycleTimer();
			}
			D.state.activeSubagentCount = 0;
			D.state.activeExecutorJobIds.clear();
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
		}
	}

	fn.getModeBadgeLabel = function() {
		const nameEl = D.dom.agentVignettesEl?.querySelector('.agent-vignette.selected .vignette-name');
		const label = nameEl?.textContent?.trim();
		return label || 'Drox';
	}

	fn.nextPendingTodoLabel = function() {
		const inProgress = D.state.todoSnapshot.find((t) => t.status === 'in_progress');
		if (inProgress) {
			return inProgress.content;
		}
		const pending = D.state.todoSnapshot.find((t) => t.status === 'pending');
		return pending ? pending.content : '';
	}

	fn.hideActivity = function() {
		fn.hideInlineActivityOnly();
		if (fn.shouldUseArchitectRunTailActivity()) {
			fn.ensureArchitectRunTailActivity();
			return;
		}
		fn.hideArchitectRunTailActivity();
	}

	fn.pickWarmupPhrase = function() {
		const phrases = D.const.WARMUP_PHRASES;
		if (!phrases?.length) {
			return 'Working…';
		}
		if (phrases.length === 1) {
			return phrases[0];
		}
		let idx = Math.floor(Math.random() * phrases.length);
		if (idx === D.state.lastWarmupPhraseIdx) {
			idx = (idx + 1) % phrases.length;
		}
		D.state.lastWarmupPhraseIdx = idx;
		return phrases[idx];
	}

	fn.getLastUserMessageEl = function() {
		if (!D.dom.logEl) {
			return null;
		}
		const users = D.dom.logEl.querySelectorAll('.msg-row-user, .msg.user.msg-user-bubble');
		return users.length > 0 ? users[users.length - 1] : null;
	}

	fn.showWarmupActivity = function() {
		if (!D.state.busy || !D.dom.logEl) {
			return;
		}
		if (fn.shouldUseArchitectRunTailActivity()) {
			fn.ensureArchitectRunTailActivity({ rotatePhrase: true });
			return;
		}
		const anchor = fn.getLastUserMessageEl();
		if (!anchor) {
			return;
		}
		fn.hideInlineActivityOnly();
		const row = document.createElement('div');
		row.className = 'activity-warmup';
		row.setAttribute('role', 'status');
		row.setAttribute('aria-live', 'polite');

		D.state.currentActivityGridEl = fn.buildActivityGrid();
		const label = document.createElement('span');
		label.className = 'activity-warmup-label';
		label.textContent = fn.pickWarmupPhrase();

		row.appendChild(D.state.currentActivityGridEl);
		row.appendChild(label);
		D.state.currentWarmupRowEl = row;
		anchor.insertAdjacentElement('afterend', row);
		fn.scrollLog();
	}

	fn.buildActivityGrid = function() {
		const grid = document.createElement('div');
		grid.className = 'activity-grid activity-grid-inline';
		grid.setAttribute('aria-hidden', 'true');
		for (let i = 0; i < 9; i++) {
			grid.appendChild(document.createElement('span'));
		}
		return grid;
	}

	/** Grille persistante : ne remplace pas les autres indicateurs en cours. */
	fn.ensurePersistentActivityGrid = function(hostEl) {
		if (fn.shouldUseArchitectRunTailActivity()) {
			fn.touchArchitectRunTailActivity();
			return null;
		}
		if (!hostEl?.isConnected) {
			return null;
		}
		let grid = hostEl.querySelector(':scope > .activity-grid.activity-grid-persistent');
		if (grid) {
			return grid;
		}
		grid = fn.buildActivityGrid();
		grid.classList.add('activity-grid-persistent');
		hostEl.prepend(grid);
		return grid;
	}

	fn.clearPersistentActivityGrids = function(rootEl) {
		const root = rootEl || document;
		for (const el of root.querySelectorAll('.activity-grid.activity-grid-persistent')) {
			el.remove();
		}
	}

	fn.showActivityOnSummary = function(summaryEl) {
		if (!D.state.busy || !summaryEl) {
			return;
		}
		if (fn.shouldUseArchitectRunTailActivity()) {
			fn.touchArchitectRunTailActivity({ rotatePhrase: true });
			return;
		}
		fn.hideInlineActivityOnly();
		if (summaryEl.classList.contains('phase-summary')) {
			fn.ensurePhaseSummaryLabel(summaryEl);
		}
		D.state.currentActivityGridEl = fn.buildActivityGrid();
		summaryEl.prepend(D.state.currentActivityGridEl);
		summaryEl.classList.add('has-activity-grid');
	}

	fn.showActivityOnCurrentPhaseSummary = function() {
		if (D.state.exploreBundleEl?.classList.contains('streaming') && D.state.exploreSummaryEl) {
			fn.showActivityOnSummary(D.state.exploreSummaryEl);
			return;
		}
		const summary = D.state.currentPhaseEl?.querySelector('.phase-summary');
		if (summary) {
			fn.showActivityOnSummary(summary);
		} else if (D.state.busy) {
			fn.showWarmupActivity();
		}
	}

	fn.showActivityBeforeNode = function(node) {
		if (!D.state.busy || !node?.parentElement) {
			return;
		}
		if (fn.shouldUseArchitectRunTailActivity()) {
			fn.touchArchitectRunTailActivity();
			return;
		}
		fn.hideInlineActivityOnly();
		D.state.currentActivityGridEl = fn.buildActivityGrid();
		node.parentElement.insertBefore(D.state.currentActivityGridEl, node);
	}

	fn.renderTodos = function(items) {
		if (!Array.isArray(items) || items.length === 0) {
			D.state.todoSnapshot = [];
			D.state.currentTodoBlockEl = null;
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
		if (block?.parentElement === D.state.exploreBodyEl) {
			D.dom.logEl.appendChild(block);
		}
		for (const old of [...D.dom.logEl.querySelectorAll('.msg-todos')]) {
			if (old !== block) {
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
			const planMount = typeof fn.getRunSection === 'function' ? fn.getRunSection('plan') : null;
			const mount = planMount || D.dom.logEl;
			const planRail = planMount?.querySelector('.plan-action-rail');
			if (planRail) {
				planMount.insertBefore(block, planRail);
			} else {
				mount.appendChild(block);
			}
			D.state.currentTodoBlockEl = block;
		}
		if (typeof fn.reparentTodoBlockToPlan === 'function') {
			fn.reparentTodoBlockToPlan();
		}
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
		fn.scrollLog();
		if (D.state.busy) {
			fn.showActivityOnCurrentPhaseSummary();
		}
	}
})(globalThis.DroxChat);
