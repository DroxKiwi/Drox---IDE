/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil linéaire : strip, outils. Routage texte → display/simple.js.

(function (D) {
	const fn = D.fn;
	const _setBusy = fn.setBusy;
	fn.setBusy = function (next) {
		if (next) {
			fn.beginLinearRunStrip?.();
			fn.resetChatStreamForTurn?.();
		} else {
			fn.hideArchitectRunTailActivity?.();
		}
		if (!next && D.state.linearRunUi) {
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
			fn.ensureLinearThinkingShell?.();
		}
		if (r === 'architect') {
			D.state.discussionRunActive = false;
		}
		D.state.orchestrationRole = r === 'architect' || r === 'architect_discussion' ? r : null;
		if (r === 'architect') {
			fn.unlockArchitectEditRunPresentation?.();
		}
		if (r === 'architect' && D.state.linearRunUi) {
			const banner = fn.getRunSection('banner');
			if (banner && !banner.querySelector('.msg-orchestration-architect')) {
				const el = document.createElement('div');
				el.className = 'msg-orchestration-role msg-orchestration-architect msg-orchestration-architect';
				el.setAttribute('role', 'status');
				el.textContent = 'Architect — edit run';
				banner.appendChild(el);
				fn.scrollLog();
			}
			fn.touchArchitectRunTailActivity?.({ rotatePhrase: true });
			return;
		}
		_renderOrchestrationRole.call(this, role);
	};

	const _createToolBlock = fn.createToolBlock;
	fn.createToolBlock = function (payload) {
		if (D.state.linearRunUi) {
			return fn.createLinearArchitectToolLine(payload);
		}
		return _createToolBlock.call(this, payload);
	};

	const _getLogMountParent = fn.getLogMountParent;
	fn.getLogMountParent = function () {
		if (D.state.linearRunUi) {
			const toolName = D.state.pendingToolName || '';
			if (fn.isArchitectVerifyTool(toolName)) {
				const verify = fn.ensureRunSection('verify');
				if (verify) {
					return verify;
				}
			}
		}
		const work = fn.getRunSection('work');
		if (work && D.state.linearRunUi) {
			return work;
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

	fn.syncAgentActivityStickyToLinearHead = function () {
		const chrome = D.dom.agentActivityStickyEl;
		if (!chrome || !D.state.linearRunUi) {
			document.querySelector('.drox-agent-activity-inline')?.remove();
			return;
		}
		const stickyHead = D.state.runStripEl?.querySelector('.drox-run-sticky-head');
		if (!stickyHead) {
			return;
		}
		let inline = stickyHead.querySelector('.drox-agent-activity-inline');
		if (chrome.hidden) {
			inline?.remove();
			return;
		}
		if (!inline) {
			inline = document.createElement('div');
			inline.className = 'drox-agent-activity-inline agent-activity-sticky';
			inline.setAttribute('role', 'status');
			inline.setAttribute('aria-live', 'polite');
			stickyHead.insertBefore(inline, stickyHead.firstChild);
		}
		inline.textContent = chrome.textContent;
		inline.title = chrome.title || '';
		inline.hidden = false;
		chrome.hidden = true;
		fn.syncStickyStackLayout();
	};

	const _updateAgentActivitySticky = fn.updateAgentActivitySticky;
	fn.updateAgentActivitySticky = function () {
		_updateAgentActivitySticky.call(this);
		fn.syncAgentActivityStickyToLinearHead?.();
	};

	const _hideAgentActivitySticky = fn.hideAgentActivitySticky;
	fn.hideAgentActivitySticky = function () {
		_hideAgentActivitySticky.call(this);
		document.querySelector('.drox-agent-activity-inline')?.remove();
	};
})(globalThis.DroxChat);
