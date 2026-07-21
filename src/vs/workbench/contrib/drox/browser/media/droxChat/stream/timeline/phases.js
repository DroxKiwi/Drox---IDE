/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Phases moteur → métadonnées fil linéaire (thinking / answer), sans bundle Exploring.

(function (D) {
	const fn = D.fn;
	const { EXPLORE_REASONING_PHASES } = D.streamLog;

	// Parité AMB-09 avec `common/droxPhaseRoute.ts` (`DROX_THINKING_PHASES`).
	const LINEAR_THINKING_PHASES = new Set([
		'internal_reasoning',
		'reasoning',
		'reading',
		'analyzing',
		'acting',
		'planning',
		'verifying',
		'testing',
		'clarifying',
	]);

	fn.closePhaseMarker = function () {
		fn.flushStreamBuffer?.({ asAnswer: false });
		if (D.state.currentPhase && EXPLORE_REASONING_PHASES.has(D.state.currentPhase)) {
			const section = typeof fn.getRunSection === 'function' ? fn.getRunSection('thinking') : null;
			if (section && typeof fn.consolidateLinearThinkingShells === 'function') {
				fn.consolidateLinearThinkingShells(section);
			}
		}
		D.state.currentPhase = null;
		if (D.state.busy || D.state.pendingRunWarmup) {
			fn.refreshActivityIndicator?.();
		} else {
			fn.hideActivity?.();
		}
	};

	fn.closeCurrentPhase = function () {
		fn.closePhaseMarker();
		D.state.currentPhaseEl = null;
		D.state.currentPhaseBodyEl = null;
	};

	fn.enterPhase = function (phase) {
		// Parité TUI : flush le buffer courant puis ouvre la phase.
		fn.flushStreamBuffer?.({ asAnswer: phase === 'answering' });
		if (phase === 'answering') {
			fn.appendPhaseMarker?.('answering');
			D.state.currentPhase = 'answering';
			D.state.currentPhaseBodyEl =
				typeof fn.getRunSection === 'function' ? fn.getRunSection('answer') : D.dom.logEl;
			if (D.state.busy || D.state.pendingRunWarmup) {
				fn.refreshActivityIndicator?.();
			}
			return;
		}
		if (phase === 'done') {
			fn.appendPhaseMarker?.('done');
			D.state.currentPhase = null;
			if (!D.state.uiReplayActive) {
				fn.finalizeAssistant?.();
				fn.finalizeRunPresentation?.();
				if (!D.state.busy) {
					fn.collapseRunWorkSection?.();
				}
				if (D.state.runStripEl?.isConnected && typeof fn.normalizeLinearThinkingLayout === 'function') {
					fn.normalizeLinearThinkingLayout(D.state.runStripEl);
				}
			}
			return;
		}
		fn.appendPhaseMarker?.(phase);
		if (LINEAR_THINKING_PHASES.has(phase)) {
			D.state.currentPhase = phase;
			D.state.currentPhaseBodyEl =
				typeof fn.getRunSection === 'function' ? fn.getRunSection('thinking') : null;
			fn.touchArchitectRunTailActivity?.({ rotatePhrase: true });
		} else {
			D.state.currentPhase = phase;
			D.state.currentPhaseBodyEl =
				typeof fn.getRunSection === 'function' ? fn.getRunSection('thinking') : null;
		}
		if (D.state.busy || D.state.pendingRunWarmup) {
			fn.refreshActivityIndicator?.();
		}
	};
})(globalThis.DroxChat);
