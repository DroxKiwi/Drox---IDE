/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.shouldUseArchitectRunTailActivity = function () {
		return fn.shouldUsePlanActivitySticky?.() ?? false;
	};

	fn.hideArchitectRunTailActivity = function () {
		if (D.state.architectTailActivityEl) {
			D.state.architectTailActivityEl.remove();
			D.state.architectTailActivityEl = null;
		}
		fn.hidePlanActivitySticky?.();
	};

	fn.ensureArchitectRunTailActivity = function (opts) {
		fn.ensurePlanActivitySticky?.(opts);
	};

	fn.touchArchitectRunTailActivity = function (opts) {
		if (!fn.shouldUsePlanActivitySticky?.()) {
			return;
		}
		fn.ensurePlanActivitySticky?.(opts);
	};

	/** Réaffiche la grille 3×3 au bon endroit pendant un run actif. */
	fn.refreshActivityIndicator = function () {
		if (!D.state.busy && !D.state.pendingRunWarmup) {
			return;
		}
		if (fn.shouldUsePlanActivitySticky?.()) {
			fn.ensurePlanActivitySticky();
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
	};
})(globalThis.DroxChat);
