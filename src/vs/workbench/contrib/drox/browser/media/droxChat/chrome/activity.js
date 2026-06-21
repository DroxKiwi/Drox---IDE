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

	fn.hideActivity = function() {
		fn.hideInlineActivityOnly();
		const root = D.dom.logEl || document;
		for (const summary of root.querySelectorAll('.phase-summary.has-activity-grid')) {
			summary.classList.remove('has-activity-grid');
		}
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
})(globalThis.DroxChat);
