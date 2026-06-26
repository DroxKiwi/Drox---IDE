/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const RUN_ACTIVITY_WATCHDOG_MS = 3500;

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

	fn.isRunCycleActive = function () {
		return Boolean(D.state.busy || D.state.pendingRunWarmup);
	};

	fn.stopRunActivityWatchdog = function () {
		if (D.state.runActivityWatchdogTimer) {
			window.clearInterval(D.state.runActivityWatchdogTimer);
			D.state.runActivityWatchdogTimer = null;
		}
	};

	fn.startRunActivityWatchdog = function () {
		fn.stopRunActivityWatchdog();
		if (!fn.isRunCycleActive() || D.state.uiReplayActive) {
			return;
		}
		D.state.runActivityWatchdogTimer = window.setInterval(() => {
			if (!fn.isRunCycleActive()) {
				fn.stopRunActivityWatchdog();
				return;
			}
			fn.ensureTailWarmupActivity?.();
		}, RUN_ACTIVITY_WATCHDOG_MS);
	};

	fn.removeOrphanRootActivityGrids = function () {
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		for (const grid of [...log.querySelectorAll(':scope > .activity-grid-inline')]) {
			grid.remove();
		}
	};

	/** Grille 3×3 uniquement dans `.activity-warmup` (phrase de statut). */
	fn.clearStrayActivityGrids = function (rootEl) {
		const root = rootEl || D.dom.logEl || document;
		for (const grid of [...root.querySelectorAll('.activity-grid')]) {
			if (!grid.closest('.activity-warmup')) {
				grid.remove();
			}
		}
		for (const summary of root.querySelectorAll(
			'.phase-summary.has-activity-grid, .msg-tool summary.has-activity-grid',
		)) {
			summary.classList.remove('has-activity-grid');
		}
		fn.removeOrphanRootActivityGrids();
	};

	/** Retire grilles flottantes ; conserve la ligne warmup pendant un cycle actif. */
	fn.hideInlineActivityOnly = function () {
		const cycleActive = fn.isRunCycleActive();
		if (!cycleActive) {
			if (D.state.currentWarmupRowEl) {
				D.state.currentWarmupRowEl.remove();
				D.state.currentWarmupRowEl = null;
			}
		}
		if (D.state.currentActivityGridEl?.isConnected) {
			const inWarmup = D.state.currentWarmupRowEl?.contains(D.state.currentActivityGridEl);
			if (!inWarmup) {
				D.state.currentActivityGridEl.remove();
			}
			D.state.currentActivityGridEl = null;
		}
		fn.clearStrayActivityGrids();
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
		fn.stopRunActivityWatchdog();
		D.state.pendingRunWarmup = false;
		if (D.state.currentWarmupRowEl) {
			D.state.currentWarmupRowEl.remove();
			D.state.currentWarmupRowEl = null;
		}
		fn.clearAllActivityGrids(D.dom.logEl || document);
		fn.hidePlanActivitySticky?.();
		fn.hideArchitectRunTailActivity();
		fn.updateComposerChrome?.();
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

	fn.ensureWarmupRowGrid = function (row) {
		if (!row) {
			return null;
		}
		let grid = row.querySelector(':scope > .activity-grid');
		if (!grid) {
			grid = fn.buildActivityGrid();
			row.insertBefore(grid, row.firstChild);
		}
		D.state.currentActivityGridEl = grid;
		return grid;
	};

	/** Ligne warmup + phrase — toujours visible en bas du tour pendant un cycle. */
	fn.ensureTailWarmupActivity = function (opts) {
		if (!fn.isRunCycleActive() || !D.dom.logEl || D.state.uiReplayActive) {
			return;
		}
		fn.hidePlanActivitySticky?.();
		const log = D.dom.logEl;
		let row = D.state.currentWarmupRowEl;
		if (!row?.isConnected) {
			fn.showWarmupActivity();
			row = D.state.currentWarmupRowEl;
		}
		if (!row?.isConnected) {
			return;
		}
		fn.clearStrayActivityGrids();
		fn.ensureWarmupRowGrid(row);
		const rotatePhrase = opts?.rotatePhrase === true;
		const label = row.querySelector('.activity-warmup-label');
		if (label && (rotatePhrase || !String(label.textContent || '').trim())) {
			label.textContent = fn.pickWarmupPhrase();
		}
		fn.repositionWarmupAfterUser();
		if (row.parentElement === log && row !== log.lastElementChild) {
			log.appendChild(row);
			fn.scrollLogToEnd?.() || fn.scrollLog?.();
		}
		fn.updateComposerChrome?.();
	};

	fn.showWarmupActivityOptimistic = function () {
		if (!D.dom.logEl || D.state.uiReplayActive) {
			return;
		}
		if (D.state.currentWarmupRowEl?.isConnected) {
			fn.ensureTailWarmupActivity();
			return;
		}
		fn.removeOrphanRootActivityGrids();
		const row = document.createElement('div');
		row.className = 'activity-warmup activity-warmup-optimistic activity-warmup-tail';
		row.setAttribute('role', 'status');
		row.setAttribute('aria-live', 'polite');

		const label = document.createElement('span');
		label.className = 'activity-warmup-label';
		label.textContent = fn.pickWarmupPhrase();

		row.appendChild(label);
		D.state.currentWarmupRowEl = row;
		D.state.pendingRunWarmup = true;
		fn.ensureWarmupRowGrid(row);

		if (typeof fn.appendToLog === 'function') {
			fn.appendToLog(row);
		} else {
			D.dom.logEl.appendChild(row);
		}
		fn.startRunActivityWatchdog();
		fn.updateComposerChrome?.();
		fn.scrollLogToEnd?.() || fn.scrollLog?.();
	};

	fn.showWarmupActivity = function() {
		if (!D.dom.logEl) {
			return;
		}
		if (!fn.isRunCycleActive()) {
			return;
		}
		fn.hidePlanActivitySticky?.();
		const anchor = fn.getLastUserMessageEl();
		if (D.state.currentWarmupRowEl?.isConnected) {
			fn.ensureTailWarmupActivity();
			return;
		}
		if (!anchor) {
			fn.showWarmupActivityOptimistic();
			return;
		}
		fn.removeOrphanRootActivityGrids();
		const row = document.createElement('div');
		row.className = 'activity-warmup activity-warmup-tail';
		row.setAttribute('role', 'status');
		row.setAttribute('aria-live', 'polite');

		const label = document.createElement('span');
		label.className = 'activity-warmup-label';
		label.textContent = fn.pickWarmupPhrase();

		row.appendChild(label);
		D.state.currentWarmupRowEl = row;
		fn.ensureWarmupRowGrid(row);
		anchor.insertAdjacentElement('afterend', row);
		fn.startRunActivityWatchdog();
		fn.scrollLog();
	};

	fn.buildActivityGrid = function() {
		const grid = document.createElement('div');
		grid.className = 'activity-grid activity-grid-inline';
		grid.setAttribute('aria-hidden', 'true');
		for (let i = 0; i < 9; i++) {
			grid.appendChild(document.createElement('span'));
		}
		return grid;
	}

	/** Grille réservée à la ligne warmup — pas sur outils / phases / todos. */
	fn.ensurePersistentActivityGrid = function (_hostEl) {
		if (fn.isRunCycleActive()) {
			fn.ensureTailWarmupActivity();
		}
		return null;
	}

	fn.clearPersistentActivityGrids = function (rootEl) {
		fn.clearAllActivityGrids(rootEl);
	};

	fn.showActivityOnSummary = function (_summaryEl) {
		if (!fn.isRunCycleActive()) {
			return;
		}
		fn.ensureTailWarmupActivity();
	};

	fn.showActivityOnCurrentPhaseSummary = function () {
		fn.ensureTailWarmupActivity();
	};

	fn.showActivityBeforeNode = function (_node) {
		if (!fn.isRunCycleActive()) {
			return;
		}
		fn.ensureTailWarmupActivity();
	};

	/** Sticky plan footer : réservé au bloc todos — pas la phrase warmup (reste dans #log). */
	fn.shouldUsePlanActivitySticky = function () {
		return false;
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
		if (D.state.currentWarmupRowEl) {
			D.state.currentWarmupRowEl.remove();
			D.state.currentWarmupRowEl = null;
		}
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
		fn.startRunActivityWatchdog();
	};
})(globalThis.DroxChat);
