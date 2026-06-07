/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil lineaire append-only : plan, work, thinking, answer (pas de promotion Exploring).

(function (D) {
	const fn = D.fn;
	fn.shouldUseArchitectActionRail = function (payload) {
		if (!D.state.linearRunUi || fn.isExecutorUiContext?.()) {
			return false;
		}
		if (D.state.orchestrationRole === 'executor') {
			return false;
		}
		const toolName = String(payload?.name ?? D.state.pendingToolName ?? '').trim();
		return !fn.isArchitectVerifyTool(toolName);
	};

	/** Rails repliés pour tout outil architecte en fil linéaire (y compris verify → plan). */
	fn.createLinearArchitectToolLine = function (payload) {
		const toolName = String(payload?.name ?? D.state.pendingToolName ?? '').trim();
		if (fn.isArchitectVerifyTool(toolName)) {
			return fn.createPlanVerifyActionLine(payload);
		}
		return fn.createArchitectActionLine(payload);
	};

	fn.ensureArchitectActionRail = function () {
		const host = fn.ensureLinearThinkingShell();
		const shell = host?.closest('.drox-linear-thinking');
		if (!shell) {
			return;
		}
		if (
			D.state.architectActionRailEl?.isConnected &&
			D.state.architectActionRailEl.closest('.drox-linear-thinking') === shell
		) {
			return;
		}
		let rail = shell.querySelector('.architect-action-rail');
		if (!rail) {
			rail = document.createElement('details');
			rail.className = 'executor-action-rail architect-action-rail';
			rail.open = false;
			rail.hidden = true;
			const summary = document.createElement('summary');
			summary.className = 'executor-action-rail-latest';
			summary.textContent = 'Waiting for first action…';
			if (typeof fn.ensurePersistentActivityGrid === 'function') {
				fn.ensurePersistentActivityGrid(summary);
			}
			const list = document.createElement('div');
			list.className = 'executor-action-rail-list';
			list.setAttribute('role', 'list');
			rail.appendChild(summary);
			rail.appendChild(list);
			shell.appendChild(rail);
			D.state.architectActionRailEl = rail;
			D.state.architectActionRailSummaryEl = summary;
			D.state.architectActionRailListEl = list;
			D.state.architectActionLineCount = 0;
			return;
		}
		D.state.architectActionRailEl = rail;
		D.state.architectActionRailSummaryEl = rail.querySelector('summary.executor-action-rail-latest');
		D.state.architectActionRailListEl = rail.querySelector('.executor-action-rail-list');
		D.state.architectActionLineCount = rail.querySelectorAll('.executor-action-line').length;
	};

	fn.updateArchitectActionRailSummary = function (lineEl) {
		const summary = D.state.architectActionRailSummaryEl;
		if (!summary || !lineEl) {
			return;
		}
		const verb = lineEl.dataset.verb || 'Ran';
		const target = lineEl.dataset.target || '';
		const running = lineEl.classList.contains('running');
		summary.innerHTML = fn.formatExecutorActionSummary(verb, target, running);
		const n = D.state.architectActionLineCount || 0;
		summary.title =
			n <= 1 ? '1 action — click for history' : `${n} actions — click for full history`;
	};

	fn.createArchitectActionLine = function (payload) {
		fn.ensureArchitectActionRail();
		const list = D.state.architectActionRailListEl;
		const rail = D.state.architectActionRailEl;
		if (!list || !rail) {
			return null;
		}
		const verb = String(payload.verb ?? 'Ran');
		const target = String(payload.target ?? '');
		const line = document.createElement('div');
		line.className = 'executor-action-line running';
		line.dataset.verb = verb;
		line.dataset.target = target;
		line.setAttribute('role', 'listitem');
		line.innerHTML = fn.formatExecutorActionSummary(verb, target, true);
		list.appendChild(line);
		D.state.architectActionLineCount = (D.state.architectActionLineCount || 0) + 1;
		rail.hidden = false;
		rail.open = false;
		fn.updateArchitectActionRailSummary(line);
		fn.scrollLog();
		fn.touchArchitectRunTailActivity?.();
		return line;
	};
})(globalThis.DroxChat);
