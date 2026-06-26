/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

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

	fn.hideInlineActivityOnly = function () {
		if (D.state.currentWarmupRowEl) {
			D.state.currentWarmupRowEl.remove();
			D.state.currentWarmupRowEl = null;
		}
		if (
			D.state.currentActivityGridEl?.isConnected &&
			D.state.currentActivityGridEl.classList.contains('activity-grid-inline')
		) {
			D.state.currentActivityGridEl.remove();
			D.state.currentActivityGridEl = null;
		}
	};

	fn.stripActivityGridsFromElement = function (el) {
		if (!el?.querySelectorAll) {
			return;
		}
		for (const grid of [...el.querySelectorAll('.activity-grid')]) {
			grid.remove();
		}
	};

	/** Retire toutes les grilles 3×3 (inline + persistantes) d’un sous-arbre DOM. */
	fn.clearAllActivityGrids = function (rootEl) {
		const root = rootEl || document;
		fn.hideInlineActivityOnly();
		for (const summary of root.querySelectorAll(
			'.phase-summary.has-activity-grid, .msg-tool summary.has-activity-grid',
		)) {
			summary.classList.remove('has-activity-grid');
		}
		for (const grid of [...root.querySelectorAll('.activity-grid')]) {
			grid.remove();
		}
	};

	fn.hideActivity = function() {
		D.state.pendingRunWarmup = false;
		fn.clearAllActivityGrids(D.dom.logEl || document);
		fn.hidePlanActivitySticky?.();
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
		const lastRow = users.length > 0 ? users[users.length - 1] : null;
		return fn.resolveUserMessageAnchor?.(lastRow) ?? lastRow;
	}

	fn.repositionWarmupAfterUser = function () {
		const row = D.state.currentWarmupRowEl;
		if (!row?.isConnected) {
			return;
		}
		const anchor = fn.getLastUserMessageEl();
		if (anchor && row.previousElementSibling !== anchor) {
			anchor.insertAdjacentElement('afterend', row);
			fn.scrollLog?.();
		}
	};

	fn.showWarmupActivityOptimistic = function () {
		if (!D.dom.logEl || D.state.uiReplayActive) {
			return;
		}
		if (D.state.currentWarmupRowEl?.isConnected) {
			fn.repositionWarmupAfterUser();
			return;
		}
		fn.hideInlineActivityOnly();
		const row = document.createElement('div');
		row.className = 'activity-warmup activity-warmup-optimistic';
		row.setAttribute('role', 'status');
		row.setAttribute('aria-live', 'polite');

		D.state.currentActivityGridEl = fn.buildActivityGrid();
		const label = document.createElement('span');
		label.className = 'activity-warmup-label';
		label.textContent = fn.pickWarmupPhrase();

		row.appendChild(D.state.currentActivityGridEl);
		row.appendChild(label);
		D.state.currentWarmupRowEl = row;
		D.state.pendingRunWarmup = true;

		if (typeof fn.appendToLog === 'function') {
			fn.appendToLog(row);
		} else {
			D.dom.logEl.appendChild(row);
		}
		fn.scrollLogToEnd?.() || fn.scrollLog?.();
	};

	fn.showWarmupActivity = function() {
		if (!D.dom.logEl) {
			return;
		}
		if (!D.state.busy && !D.state.pendingRunWarmup) {
			return;
		}
		if (fn.shouldUsePlanActivitySticky?.()) {
			fn.ensurePlanActivitySticky({ rotatePhrase: true });
			return;
		}
		const anchor = fn.getLastUserMessageEl();
		if (D.state.currentWarmupRowEl?.isConnected) {
			if (anchor) {
				fn.repositionWarmupAfterUser();
			}
			return;
		}
		if (!anchor) {
			fn.showWarmupActivityOptimistic();
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
		if (fn.shouldUsePlanActivitySticky?.()) {
			fn.ensurePlanActivitySticky();
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

	fn.clearPersistentActivityGrids = function (rootEl) {
		fn.clearAllActivityGrids(rootEl);
	};

	fn.showActivityOnSummary = function(summaryEl) {
		if ((!D.state.busy && !D.state.pendingRunWarmup) || !summaryEl) {
			return;
		}
		if (fn.shouldUsePlanActivitySticky?.()) {
			fn.ensurePlanActivitySticky({ rotatePhrase: true });
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
		const summary = D.state.currentPhaseEl?.querySelector('.phase-summary');
		if (summary) {
			fn.showActivityOnSummary(summary);
		} else if (D.state.busy || D.state.pendingRunWarmup) {
			fn.showWarmupActivity();
		}
	}

	fn.showActivityBeforeNode = function(node) {
		if ((!D.state.busy && !D.state.pendingRunWarmup) || !node?.parentElement) {
			return;
		}
		if (fn.shouldUsePlanActivitySticky?.()) {
			fn.ensurePlanActivitySticky({ rotatePhrase: true });
			return;
		}
		fn.hideInlineActivityOnly();
		D.state.currentActivityGridEl = fn.buildActivityGrid();
		node.parentElement.insertBefore(D.state.currentActivityGridEl, node);
	}

	fn.shouldUsePlanActivitySticky = function () {
		return Boolean(
			!D.state.uiReplayActive &&
				D.state.busy &&
				D.state.linearRunUi &&
				D.dom.planStickyFooterEl,
		);
	};

	fn.hidePlanActivitySticky = function () {
		const row = D.dom.planActivityStickyEl;
		if (row) {
			row.hidden = true;
		}
		fn.syncPlanStickyFooter?.();
	};

	fn.ensurePlanActivitySticky = function (opts) {
		if (!fn.shouldUsePlanActivitySticky()) {
			fn.hidePlanActivitySticky();
			return;
		}
		const footer = D.dom.planStickyFooterEl;
		const row = D.dom.planActivityStickyEl;
		if (!footer || !row) {
			return;
		}
		fn.hideInlineActivityOnly();
		if (D.state.architectTailActivityEl) {
			D.state.architectTailActivityEl.remove();
			D.state.architectTailActivityEl = null;
		}
		const rotatePhrase = opts?.rotatePhrase === true;
		let label = row.querySelector('.activity-warmup-label');
		if (!label) {
			label = document.createElement('span');
			label.className = 'activity-warmup-label';
			row.appendChild(label);
		}
		let grid = row.querySelector('.activity-grid');
		if (!grid) {
			grid = fn.buildActivityGrid();
			grid.classList.add('activity-grid-persistent');
			row.insertBefore(grid, label);
		}
		if (rotatePhrase || !label.textContent) {
			label.textContent = fn.pickWarmupPhrase();
		}
		row.hidden = false;
		if (row.parentElement !== footer) {
			footer.prepend(row);
		} else if (footer.firstElementChild !== row) {
			footer.prepend(row);
		}
		footer.hidden = false;
		fn.syncPlanStickyFooter?.();
	};
})(globalThis.DroxChat);
