/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.getLogMountParent = function () {
		return D.dom.logEl;
	};

	fn.formatExecutorActionSummary = function (verb, target, running) {
		const v = String(verb || 'Ran');
		const t = String(target || '').trim();
		const tail = running ? ' …' : '';
		return `<strong>${v}</strong>${t ? ` <span class="tool-target">${t}</span>` : ''}${tail}`;
	};

	fn.ensurePlanActionRail = function () {
		const plan = typeof fn.getRunSection === 'function' ? fn.getRunSection('plan') : null;
		if (!plan) {
			return;
		}
		if (D.state.planActionRailEl?.isConnected) {
			return;
		}
		const rail = document.createElement('details');
		rail.className = 'executor-action-rail plan-action-rail';
		rail.open = false;
		const summary = document.createElement('summary');
		summary.className = 'executor-action-rail-latest';
		summary.textContent = 'Verify…';
		const list = document.createElement('div');
		list.className = 'executor-action-rail-list';
		list.setAttribute('role', 'list');
		rail.appendChild(summary);
		rail.appendChild(list);
		const todos = plan.querySelector('.msg-todos');
		if (todos) {
			todos.insertAdjacentElement('afterend', rail);
		} else {
			plan.appendChild(rail);
		}
		D.state.planActionRailEl = rail;
		D.state.planActionRailSummaryEl = summary;
		D.state.planActionRailListEl = list;
		D.state.planActionLineCount = 0;
	};

	fn.updatePlanActionRailSummary = function (lineEl) {
		const summary = D.state.planActionRailSummaryEl;
		if (!summary || !lineEl) {
			return;
		}
		const verb = lineEl.dataset.verb || 'Ran';
		const target = lineEl.dataset.target || '';
		const running = lineEl.classList.contains('running');
		summary.innerHTML = fn.formatExecutorActionSummary(verb, target, running);
		const n = D.state.planActionLineCount || 0;
		summary.title =
			n <= 1 ? '1 verify action — click for history' : `${n} verify actions — click for history`;
	};

	fn.createPlanVerifyActionLine = function (payload) {
		fn.ensurePlanActionRail();
		const list = D.state.planActionRailListEl;
		const rail = D.state.planActionRailEl;
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
		D.state.planActionLineCount += 1;
		rail.hidden = false;
		rail.open = false;
		fn.updatePlanActionRailSummary(line);
		fn.scrollLog();
		return line;
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

	fn.createLinearArchitectToolLine = function (payload) {
		const toolName = String(payload?.name ?? D.state.pendingToolName ?? '').trim();
		if (fn.isArchitectVerifyTool(toolName)) {
			return fn.createPlanVerifyActionLine(payload);
		}
		return fn.createArchitectActionLine(payload);
	};

	fn.createToolBlock = function (payload) {
		const details = document.createElement('details');
		details.className = 'msg-tool msg-ai-frame running drox-log-indent';
		details.open = false;
		const summary = document.createElement('summary');
		const verb = String(payload.verb ?? 'Ran');
		const target = String(payload.target ?? '');
		summary.innerHTML = `<strong>${verb}</strong>${target ? ` <span class="tool-target">${target}</span>` : ''}`;
		const body = document.createElement('div');
		body.className = 'msg-tool-body';
		if (payload.argsPreview) {
			const pre = document.createElement('pre');
			pre.textContent = payload.argsPreview;
			body.appendChild(pre);
		}
		details.appendChild(summary);
		details.appendChild(body);
		const parent = fn.getLogMountParent();
		const preview = summary.innerHTML;
		if (fn.shouldUseCollapsibleToolTray?.(parent)) {
			fn.mountToolBlockInTray?.(parent, details, preview);
		} else {
			parent.appendChild(details);
		}
		fn.scrollLog();
		return details;
	};

	fn.finishToolBlock = function (block, payload) {
		block.classList.remove('running');
		if (block.classList.contains('executor-action-line')) {
			if (payload.isError) {
				block.classList.add('error');
				fn.markChatIssueElement?.(block);
			}
			block.innerHTML = fn.formatExecutorActionSummary(
				block.dataset.verb || 'Ran',
				block.dataset.target || '',
				false,
			);
			if (block.closest('.plan-action-rail')) {
				fn.updatePlanActionRailSummary?.(block);
			} else if (block.closest('.architect-action-rail')) {
				fn.updateArchitectActionRailSummary?.(block);
			}
			fn.scrollLog();
			return;
		}
		block.open = false;
		if (payload.isError) {
			block.classList.add('error');
			fn.markChatIssueElement?.(block);
		}
		const body = block.querySelector('.msg-tool-body');
		if (body && payload.outputPreview) {
			const pre = document.createElement('pre');
			pre.textContent = payload.outputPreview;
			body.appendChild(pre);
		}
		const toolSummary = block.querySelector('summary');
		if (toolSummary && block.parentElement?.classList?.contains('drox-collapsible-tray-inner')) {
			const trayInner = block.parentElement;
			const trayDetails = trayInner.closest('details');
			if (trayDetails) {
				const traySummary = trayDetails.querySelector(':scope > summary');
				if (traySummary) {
					traySummary.innerHTML = toolSummary.innerHTML;
					const n = trayInner.childElementCount;
					traySummary.title =
						n <= 1 ? '1 tool — click for history' : `${n} tools — click for full history`;
				}
			}
		}
	};
})(globalThis.DroxChat);
