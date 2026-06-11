/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Phases moteur → métadonnées fil linéaire (thinking / answer), sans bundle Exploring.

(function (D) {
	const fn = D.fn;
	const { EXPLORE_REASONING_PHASES } = D.streamLog;

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
		if (D.state.currentPhase && EXPLORE_REASONING_PHASES.has(D.state.currentPhase)) {
			const section = typeof fn.getRunSection === 'function' ? fn.getRunSection('thinking') : null;
			if (section && typeof fn.consolidateLinearThinkingShells === 'function') {
				fn.consolidateLinearThinkingShells(section);
			}
			D.state.currentPhase = null;
		}
		fn.hideActivity?.();
	};

	fn.closeCurrentPhase = function () {
		fn.closePhaseMarker();
		D.state.currentPhaseEl = null;
		D.state.currentPhaseBodyEl = null;
	};

	fn.enterPhase = function (phase) {
		if (phase === 'answering') {
			D.state.currentPhase = 'answering';
			D.state.currentPhaseBodyEl =
				typeof fn.getRunSection === 'function' ? fn.getRunSection('answer') : D.dom.logEl;
			return;
		}
		if (phase === 'done') {
			D.state.currentPhase = null;
			fn.finalizeAssistant?.();
			fn.finalizeRunPresentation?.();
			if (D.state.runStripEl?.isConnected && typeof fn.normalizeLinearThinkingLayout === 'function') {
				fn.normalizeLinearThinkingLayout(D.state.runStripEl);
			}
			return;
		}
		if (LINEAR_THINKING_PHASES.has(phase)) {
			D.state.currentPhase = phase;
			D.state.currentPhaseBodyEl =
				typeof fn.getRunSection === 'function' ? fn.getRunSection('thinking') : null;
			if (phase === 'internal_reasoning' || phase === 'reasoning') {
				fn.ensureLinearThinkingShell?.();
			}
			fn.touchArchitectRunTailActivity?.({ rotatePhrase: true });
		}
	};
})(globalThis.DroxChat);
