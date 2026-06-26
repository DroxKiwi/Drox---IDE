/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil linéaire : thinking + outils inline dans la chronologie du strip (parité TUI).

(function (D) {
	const fn = D.fn;
	const _setBusy = fn.setBusy;
	fn.setBusy = function (next) {
		if (D.state.uiReplayActive) {
			_setBusy.call(this, next);
			return;
		}
		if (next) {
			// Parité performSend + `state busy:true` — active le routage chronologie (thinking → phase-block).
			fn.resetLinearTurnAnchors?.();
			fn.beginLinearRunStrip?.();
		} else {
			fn.hideArchitectRunTailActivity?.();
			fn.flushStreamBuffer?.({ asAnswer: true });
			fn.finalizeAssistant?.();
			document.body.classList.remove('drox-linear-run-active');
			D.state.linearRunUi = false;
			fn.refreshLastUserStickyRow?.();
		}
		_setBusy.call(this, next);
	};

	const _renderOrchestrationRole = fn.renderOrchestrationRole;
	fn.renderOrchestrationRole = function (role) {
		const r = String(role || '').trim().toLowerCase();
		if (r === 'architect_discussion') {
			fn.beginDiscussionRunPresentation?.();
		}
		if (r === 'architect') {
			D.state.discussionRunActive = false;
		}
		D.state.orchestrationRole = r === 'architect' || r === 'architect_discussion' ? r : null;
		if (r === 'architect') {
			fn.unlockArchitectEditRunPresentation?.();
		}
		_renderOrchestrationRole.call(this, role);
	};

	const _createToolBlock = fn.createToolBlock;
	fn.createToolBlock = function (payload) {
		if (D.state.linearRunUi) {
			fn.flushStreamBuffer?.({ asAnswer: false });
		}
		return _createToolBlock.call(this, payload);
	};

	const _getLogMountParent = fn.getLogMountParent;
	fn.getLogMountParent = function () {
		const chrono = typeof fn.getChronologyMount === 'function' ? fn.getChronologyMount() : null;
		if (chrono && D.state.linearRunUi) {
			return chrono;
		}
		return D.dom.logEl || _getLogMountParent.call(this);
	};

	const _finalizeRunPresentation = fn.finalizeRunPresentation;
	fn.finalizeRunPresentation = function () {
		_finalizeRunPresentation?.call(this);
	};
})(globalThis.DroxChat);
