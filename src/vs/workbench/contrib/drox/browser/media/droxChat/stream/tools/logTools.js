/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.createToolBlock = function (payload) {
		if (fn.isExecutorUiContext() && fn.isExecutorCaptureActive()) {
			return fn.createExecutorActionLine(payload, payload?.executorJobId);
		}
		const details = document.createElement('details');
		details.className = 'msg-tool msg-ai-frame running drox-log-indent';
		details.open = false;
		const summary = document.createElement('summary');
		const verb = String(payload.verb ?? 'Ran');
		const target = String(payload.target ?? '');
		summary.innerHTML = `<strong>${verb}</strong>${target ? ` <span class="tool-target">${target}</span>` : ''}`;
		if (payload.name === 'task' && payload.taskBackground === true) {
			const badge = document.createElement('span');
			badge.className = 'task-mode-badge subagent-badge subagent-badge-async';
			badge.textContent = 'Async';
			summary.appendChild(badge);
		} else if (payload.name === 'task') {
			const badge = document.createElement('span');
			badge.className = 'task-mode-badge subagent-badge subagent-badge-sync';
			badge.textContent = 'Sync';
			summary.appendChild(badge);
		}
		const body = document.createElement('div');
		body.className = 'msg-tool-body';
		if (payload.argsPreview) {
			const pre = document.createElement('pre');
			pre.textContent = payload.argsPreview;
			body.appendChild(pre);
		}
		details.appendChild(summary);
		details.appendChild(body);
		const parent = fn.getLogMountParent(payload?.executorJobId);
		const preview = summary.innerHTML;
		if (fn.shouldUseCollapsibleToolTray?.(parent)) {
			fn.mountToolBlockInTray?.(parent, details, preview);
		} else {
			parent.appendChild(details);
		}
		fn.scrollLog();
		return details;
	};

	fn.parseTaskToolOutput = function (raw) {
		if (!raw || typeof raw !== 'object') {
			return null;
		}
		const o = raw;
		return {
			mode: String(o.mode ?? ''),
			status: String(o.status ?? ''),
			jobId: String(o.job_id ?? o.jobId ?? ''),
		};
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
			} else {
				fn.updateExecutorActionRailSummary(block);
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
		if (payload.name === 'task' && payload.toolOutput !== undefined) {
			const parsed = fn.parseTaskToolOutput(payload.toolOutput);
			if (parsed && body) {
				const lines = [];
				if (parsed.mode) {
					lines.push(`mode: ${parsed.mode}`);
				}
				if (parsed.status) {
					lines.push(`status: ${parsed.status}`);
				}
				if (parsed.jobId) {
					lines.push(`job_id: ${parsed.jobId}`);
				}
				if (lines.length > 0) {
					const pre = document.createElement('pre');
					pre.textContent = lines.join('\n');
					body.appendChild(pre);
				}
				const summary = block.querySelector('summary');
				if (summary && parsed.mode === 'async' && parsed.status === 'running') {
					const badge = document.createElement('span');
					badge.className = 'task-mode-badge subagent-badge subagent-badge-running';
					badge.textContent = 'Running';
					summary.appendChild(badge);
				}
			}
		} else if (body && payload.outputPreview) {
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
