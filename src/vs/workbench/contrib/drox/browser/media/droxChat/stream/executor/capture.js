/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.syncExecutorCapturePointers = function (capture) {
		if (!capture) {
			D.state.executorCaptureJobId = null;
			D.state.executorCaptureStreamEl = null;
			D.state.executorCaptureToolsEl = null;
			D.state.executorCaptureThinkingEl = null;
			D.state.executorCaptureReportEl = null;
			D.state.executorActionRailEl = null;
			D.state.executorActionRailSummaryEl = null;
			D.state.executorActionRailListEl = null;
			D.state.executorActionLineCount = 0;
			return;
		}
		D.state.executorCaptureJobId = capture.jobId;
		D.state.executorCaptureStreamEl = capture.streamEl;
		D.state.executorCaptureToolsEl = capture.toolsEl;
		D.state.executorCaptureThinkingEl = capture.thinkingEl;
		D.state.executorCaptureReportEl = capture.reportEl;
		D.state.executorActionRailEl = capture.railEl;
		D.state.executorActionRailSummaryEl = capture.railSummaryEl;
		D.state.executorActionRailListEl = capture.railListEl;
		D.state.executorActionLineCount = capture.actionLineCount || 0;
	};

	fn.setActiveExecutorCapture = function (jobId) {
		const id = String(jobId || '').trim();
		if (!id) {
			return;
		}
		D.state.executorActiveJobId = id;
		const capture = D.state.executorCaptures.get(id);
		if (capture) {
			fn.syncExecutorCapturePointers(capture);
		}
	};

	/** Carte exécuteur pour un job (batch parallèle — ne pas utiliser le seul pointeur actif). */
	fn.resolveExecutorCapture = function (jobId) {
		const id = String(jobId || '').trim();
		if (id && D.state.executorCaptures.has(id)) {
			return D.state.executorCaptures.get(id);
		}
		if (D.state.executorCaptures.size === 1) {
			return D.state.executorCaptures.values().next().value;
		}
		const activeId = D.state.executorActiveJobId || D.state.executorCaptureJobId;
		if (activeId) {
			return D.state.executorCaptures.get(activeId);
		}
		return undefined;
	};

	fn.executorCaptureFromActionLine = function (lineEl) {
		const card = lineEl?.closest?.('.msg-subagent-executor');
		if (!card) {
			return undefined;
		}
		for (const capture of D.state.executorCaptures.values()) {
			if (capture.streamEl && card.contains(capture.streamEl)) {
				return capture;
			}
		}
		return undefined;
	};

	fn.isExecutorCaptureActive = function () {
		if (D.state.executorCaptures?.size) {
			for (const capture of D.state.executorCaptures.values()) {
				if (capture.streamEl?.isConnected) {
					return true;
				}
			}
		}
		return Boolean(D.state.executorCaptureStreamEl?.isConnected);
	};

	/** RoleEnter peut précéder la carte ; batch parallèle = une capture par job. */
	fn.isExecutorUiContext = function () {
		return (
			D.state.orchestrationRole === 'executor' ||
			fn.isExecutorCaptureActive() ||
			(D.state.activeExecutorJobIds?.size || 0) > 0
		);
	};

	/** Conteneur visible pour diffs exécuteur (hors rail <details> replié). */
	fn.resolveExecutorStreamToolsMount = function (toolBlock) {
		if (toolBlock?.classList?.contains('executor-action-line')) {
			return (
				toolBlock.closest('.msg-subagent-executor')?.querySelector('.executor-stream-tools') ??
				null
			);
		}
		const live = D.state.executorCaptureToolsEl;
		return live?.isConnected ? live : null;
	};

	fn.getLogMountParent = function (jobId) {
		const capture = fn.resolveExecutorCapture(jobId);
		if (capture?.toolsEl?.isConnected) {
			return capture.toolsEl;
		}
		if (fn.isExecutorCaptureActive() && D.state.executorCaptureToolsEl) {
			return D.state.executorCaptureToolsEl;
		}
		return D.dom.logEl;
	};

	fn.ensureExecutorActionRailForCapture = function (capture) {
		if (!capture?.toolsEl) {
			return;
		}
		if (capture.railEl?.isConnected) {
			return;
		}
		const rail = document.createElement('details');
		rail.className = 'executor-action-rail';
		rail.open = false;
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
		capture.toolsEl.appendChild(rail);
		capture.railEl = rail;
		capture.railSummaryEl = summary;
		capture.railListEl = list;
		capture.actionLineCount = capture.actionLineCount || 0;
	};

	fn.ensureExecutorActionRail = function (jobId) {
		const capture = fn.resolveExecutorCapture(jobId);
		if (capture) {
			fn.ensureExecutorActionRailForCapture(capture);
			fn.syncExecutorCapturePointers(capture);
		}
	};

	fn.formatExecutorActionSummary = function (verb, target, running) {
		const v = String(verb || 'Ran');
		const t = String(target || '').trim();
		const tail = running ? ' …' : '';
		return `<strong>${v}</strong>${t ? ` <span class="tool-target">${t}</span>` : ''}${tail}`;
	};

	fn.updateExecutorActionRailSummaryForCapture = function (capture, lineEl) {
		const summary = capture?.railSummaryEl;
		if (!summary || !lineEl) {
			return;
		}
		const verb = lineEl.dataset.verb || 'Ran';
		const target = lineEl.dataset.target || '';
		const running = lineEl.classList.contains('running');
		summary.innerHTML = fn.formatExecutorActionSummary(verb, target, running);
		const n = capture.actionLineCount || 0;
		summary.title =
			n <= 1 ? '1 action — click for history' : `${n} actions — click for full history`;
	};

	fn.updateExecutorActionRailSummary = function (lineEl) {
		const capture = fn.executorCaptureFromActionLine(lineEl);
		if (capture) {
			fn.updateExecutorActionRailSummaryForCapture(capture, lineEl);
			return;
		}
		fn.updateExecutorActionRailSummaryForCapture(
			{
				railSummaryEl: D.state.executorActionRailSummaryEl,
				actionLineCount: D.state.executorActionLineCount,
			},
			lineEl,
		);
	};

	fn.ensurePlanActionRail = function () {
		const plan =
			typeof fn.getRunSection === 'function' ? fn.getRunSection('plan') : null;
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

	fn.createExecutorActionLine = function (payload, jobId) {
		const capture = fn.resolveExecutorCapture(jobId || payload?.executorJobId);
		if (!capture) {
			return null;
		}
		fn.ensureExecutorActionRailForCapture(capture);
		const list = capture.railListEl;
		if (!list) {
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
		capture.actionLineCount = (capture.actionLineCount || 0) + 1;
		if (capture.railEl) {
			capture.railEl.open = false;
		}
		fn.updateExecutorActionRailSummaryForCapture(capture, line);
		fn.scrollLog();
		return line;
	};

	fn.beginExecutorCapture = function (jobId, cardEl) {
		const captureJobId = String(jobId || 'executor').trim() || 'executor';
		const stream = document.createElement('div');
		stream.className = 'executor-stream';

		const tools = document.createElement('div');
		tools.className = 'executor-stream-tools';

		const thinking = document.createElement('details');
		thinking.className = 'executor-stream-thinking';
		thinking.open = true;
		const thinkSummary = document.createElement('summary');
		thinkSummary.textContent = 'Thinking — Executor';
		if (typeof fn.ensurePersistentActivityGrid === 'function') {
			fn.ensurePersistentActivityGrid(thinkSummary);
		}
		const thinkBody = document.createElement('div');
		thinkBody.className = 'executor-stream-thinking-body drox-explore-reasoning-msg';
		thinking.appendChild(thinkSummary);
		thinking.appendChild(thinkBody);

		const report = document.createElement('div');
		report.className = 'executor-stream-report';
		report.hidden = true;

		stream.appendChild(tools);
		stream.appendChild(thinking);
		stream.appendChild(report);
		cardEl.appendChild(stream);

		const capture = {
			jobId: captureJobId,
			streamEl: stream,
			toolsEl: tools,
			thinkingEl: thinkBody,
			thinkingDetails: thinking,
			reportEl: report,
			railEl: null,
			railSummaryEl: null,
			railListEl: null,
			actionLineCount: 0,
		};
		D.state.executorCaptures.set(captureJobId, capture);
		fn.ensureExecutorActionRailForCapture(capture);
		fn.bindThinkingScrollEl(thinkBody);
		D.state.pendingTodoUpdates = null;
		fn.flushPendingExecutorThinking(captureJobId);
	};

	fn.formatExecutorCardSummary = function (summary, success) {
		const s = String(summary || '').trim();
		if (!s) {
			return success ? '(task completed)' : '(failed)';
		}
		const reportMatch = s.match(/##\s*Executor report[\s\S]*/i);
		if (reportMatch) {
			const block = reportMatch[0].trim();
			return block.length > 1400 ? `${block.slice(0, 1400)}…` : block;
		}
		return s.length > 900 ? `${s.slice(0, 900)}…` : s;
	};

	fn.flushPendingExecutorThinking = function (jobId) {
		const id = String(jobId || '').trim();
		if (id && D.state.pendingExecutorThinkingByJob?.has(id)) {
			const pending = D.state.pendingExecutorThinkingByJob.get(id);
			D.state.pendingExecutorThinkingByJob.delete(id);
			if (pending?.length) {
				for (const chunk of pending) {
					fn.appendExecutorThinkingDelta(chunk, true, id);
				}
			}
			return;
		}
		const pending = D.state.pendingExecutorThinking;
		if (!pending?.length) {
			D.state.pendingExecutorThinking = null;
			return;
		}
		const capture = fn.resolveExecutorCapture(id);
		if (!capture?.thinkingEl) {
			return;
		}
		D.state.pendingExecutorThinking = null;
		for (const chunk of pending) {
			fn.appendExecutorThinkingDelta(chunk, true, capture.jobId);
		}
	};

	fn.appendExecutorThinkingDelta = function (text, fromFlush, jobId) {
		const t = String(text || '');
		if (!t) {
			return;
		}
		const capture = fn.resolveExecutorCapture(jobId);
		const host = capture?.thinkingEl;
		if (!host) {
			if (!fromFlush && fn.isExecutorUiContext()) {
				const id = String(jobId || '').trim();
				if (id) {
					if (!D.state.pendingExecutorThinkingByJob) {
						D.state.pendingExecutorThinkingByJob = new Map();
					}
					const pending = D.state.pendingExecutorThinkingByJob.get(id) || [];
					pending.push(t);
					D.state.pendingExecutorThinkingByJob.set(id, pending);
				} else {
					if (!D.state.pendingExecutorThinking) {
						D.state.pendingExecutorThinking = [];
					}
					D.state.pendingExecutorThinking.push(t);
				}
			}
			return;
		}
		host.dataset.raw = (host.dataset.raw || '') + t;
		fn.setAssistantMarkdown(host, host.dataset.raw);
		const details = host.closest('details.executor-stream-thinking');
		if (details) {
			details.open = true;
		}
		fn.scrollThinkingEl(host);
		fn.scrollLog();
	};

	fn.endExecutorCapture = function (jobId) {
		const id = String(jobId || D.state.executorActiveJobId || '').trim();
		if (!id) {
			D.state.executorCaptures.clear();
			D.state.executorActiveJobId = null;
			fn.syncExecutorCapturePointers(null);
			D.state.pendingExecutorThinking = null;
			return;
		}
		const capture = D.state.executorCaptures.get(id);
		if (capture?.thinkingDetails) {
			capture.thinkingDetails.open = false;
		}
		if (capture?.railEl) {
			capture.railEl.open = false;
		}
		D.state.executorCaptures.delete(id);
		if (D.state.executorActiveJobId === id) {
			const next = [...D.state.activeExecutorJobIds].find((jid) => D.state.executorCaptures.has(jid));
			if (next) {
				fn.setActiveExecutorCapture(next);
			} else {
				D.state.executorActiveJobId = null;
				fn.syncExecutorCapturePointers(null);
				D.state.pendingExecutorThinking = null;
			}
		}
		if (D.dom.logEl) {
			for (const grid of D.dom.logEl.querySelectorAll(
				'.executor-action-rail-latest .activity-grid.activity-grid-persistent, details.executor-stream-thinking summary .activity-grid.activity-grid-persistent',
			)) {
				grid.remove();
			}
		}
		const pending = D.state.pendingTodoUpdates;
		D.state.pendingTodoUpdates = null;
		if (pending && pending.length > 0) {
			fn.renderTodos(pending);
		}
		fn.scrollLog();
	};

})(globalThis.DroxChat);
