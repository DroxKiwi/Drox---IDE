/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

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
})(globalThis.DroxChat);
