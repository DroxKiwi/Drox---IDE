/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil linéaire : outils inline dans la chronologie (parité TUI).

(function (D) {
	const fn = D.fn;
	const _setBusy = fn.setBusy;
	fn.setBusy = function (next) {
		if (next) {
			fn.beginLinearRunStrip?.();
			fn.resetChatStreamForTurn?.();
		} else {
			fn.hideArchitectRunTailActivity?.();
			document.body.classList.remove('drox-linear-run-active');
		}
		if (!next && D.state.linearRunUi) {
			fn.flushStreamBuffer?.({ asAnswer: true });
			fn.sealAllOpenRunStrips?.();
			if (typeof fn.shouldPreserveDiscussionStripOnBusyEnd === 'function' && fn.shouldPreserveDiscussionStripOnBusyEnd()) {
				fn.parkAllLinearFinalAnswers?.();
			} else {
				fn.parkAllLinearFinalAnswers?.();
				fn.finalizeRunPresentation?.();
				fn.endLinearRunStrip?.();
				fn.resetChatStreamForTurn?.();
			}
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
		return _getLogMountParent.call(this);
	};

	const _finalizeRunPresentation = fn.finalizeRunPresentation;
	fn.finalizeRunPresentation = function () {
		if (D.state.linearRunUi || fn.hasLinearRunStripsOnLog()) {
			fn.parkAllLinearFinalAnswers();
		}
		_finalizeRunPresentation?.call(this);
	};

	const _updateAgentActivitySticky = fn.updateAgentActivitySticky;
	fn.updateAgentActivitySticky = function () {
		_updateAgentActivitySticky.call(this);
	};
})(globalThis.DroxChat);
