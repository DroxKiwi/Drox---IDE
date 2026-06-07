/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.renderSubagentStart = function (payload) {
		D.state.activeSubagentCount = (D.state.activeSubagentCount || 0) + 1;
		fn.updateAgentActivitySticky();
		const type = String(payload?.subagentType ?? 'explore').trim();
		const desc = String(payload?.description ?? '').trim();
		const jobId = String(payload?.jobId ?? '').trim();
		const background = payload?.background === true;
		const isExecutor = type === 'executor';
		if (isExecutor && jobId) {
			D.state.activeExecutorJobIds.add(jobId);
		}
		if (isExecutor && jobId) {
			fn.highlightTodoTask(jobId, 'running');
		}
		const el = document.createElement('div');
		el.className = `msg-subagent-card msg-subagent-start msg-subagent-running${isExecutor ? ' msg-subagent-executor' : ''}`;
		el.setAttribute('role', 'note');
		const title = document.createElement('div');
		title.className = 'subagent-card-title';
		const titleLabel = isExecutor
			? `Executor${jobId ? ` · ${jobId}` : ''}`
			: `Sub-agent (${type})`;
		title.appendChild(document.createTextNode(titleLabel));
		if (typeof fn.ensurePersistentActivityGrid === 'function') {
			fn.ensurePersistentActivityGrid(title);
		}
		fn.appendSubagentBadge(
			title,
			background ? 'Async' : 'Sync',
			background ? 'subagent-badge-async' : 'subagent-badge-sync',
		);
		fn.appendSubagentBadge(title, 'Running', 'subagent-badge-running');
		if (jobId) {
			const jid = document.createElement('span');
			jid.className = 'subagent-job-id';
			jid.textContent = jobId;
			jid.title = jobId;
			title.appendChild(jid);
		}
		el.appendChild(title);
		if (desc) {
			const body = document.createElement('div');
			body.className = 'subagent-card-body';
			body.textContent = desc;
			el.appendChild(body);
		}
		if (jobId) {
			D.state.subagentJobCards.set(jobId, el);
		}
		fn.mountSubagentCard(el);
		if (isExecutor && jobId) {
			fn.beginExecutorCapture(jobId, el);
		}
	};

	fn.renderSubagentDone = function (payload) {
		D.state.activeSubagentCount = Math.max(0, (D.state.activeSubagentCount || 0) - 1);
		fn.updateAgentActivitySticky();
		const type = String(payload?.subagentType ?? 'explore').trim();
		const isExecutor = type === 'executor';
		const summary = String(payload?.summary ?? '').trim();
		const truncated = payload?.truncated === true;
		const iters = payload?.iterationsUsed;
		const jobId = String(payload?.jobId ?? '').trim();
		const taskStatus = String(payload?.taskStatus ?? '').trim().toLowerCase();
		const isPartial = taskStatus === 'partial';
		const isFailed = taskStatus === 'failed' || (payload?.success === false && !isPartial);
		const success = !isFailed && !isPartial && payload?.success !== false;
		const errMsg = String(payload?.errorMessage ?? '').trim();
		let el = jobId ? D.state.subagentJobCards.get(jobId) : undefined;
		if (el?.isConnected) {
			el.classList.remove('msg-subagent-start', 'msg-subagent-running');
			el.classList.remove('msg-subagent-partial');
			if (isPartial) {
				el.classList.add('msg-subagent-partial');
				fn.markChatIssueElement?.(el);
			} else {
				el.classList.add(success ? 'msg-subagent-done' : 'msg-subagent-failed');
				if (!success) {
					fn.markChatIssueElement?.(el);
				}
			}
			if (isExecutor) {
				el.classList.add('msg-subagent-executor');
			}
			const title = el.querySelector('.subagent-card-title');
			if (title) {
				for (const grid of title.querySelectorAll('.activity-grid.activity-grid-persistent')) {
					grid.remove();
				}
				for (const badge of title.querySelectorAll('.subagent-badge-running')) {
					badge.remove();
				}
				const statusLabel = isPartial ? 'partial' : success ? 'done' : 'failed';
				let footer = el.querySelector('.subagent-card-footer');
				if (!footer) {
					footer = document.createElement('div');
					footer.className = 'subagent-card-footer';
					el.appendChild(footer);
				}
				footer.replaceChildren();
				if (isPartial) {
					fn.appendSubagentBadge(footer, 'Partial', 'subagent-badge-partial');
				} else if (!success) {
					fn.appendSubagentBadge(footer, 'Failed', 'subagent-badge-failed');
				} else {
					fn.appendSubagentBadge(footer, 'Done', 'subagent-badge-done');
				}
				if (typeof iters === 'number' && iters > 0) {
					const meta = document.createElement('span');
					meta.className = 'subagent-job-id';
					meta.textContent = `${iters} iter`;
					footer.appendChild(meta);
				}
				if (truncated) {
					const meta = document.createElement('span');
					meta.className = 'subagent-job-id';
					meta.textContent = 'truncated';
					footer.appendChild(meta);
				}
				const statusNote = document.createElement('span');
				statusNote.className = 'subagent-card-status-note';
				statusNote.textContent = statusLabel;
				footer.appendChild(statusNote);
			}
			let body = el.querySelector('.subagent-card-body');
			const showSummary = success || isPartial;
			const text = showSummary ? summary : errMsg || summary || '(failed with no details)';
			if (isExecutor) {
				const reportEl = el.querySelector('.executor-stream-report');
				const shortText = fn.formatExecutorCardSummary(text, showSummary);
				if (reportEl) {
					reportEl.hidden = false;
					reportEl.textContent = '';
					const pre = document.createElement('div');
					pre.className = 'executor-report-body markdown';
					fn.setAssistantMarkdown(pre, shortText);
					reportEl.appendChild(pre);
				}
				if (body) {
					body.remove();
				}
				const thinkDetails = el.querySelector('details.executor-stream-thinking');
				if (thinkDetails) {
					thinkDetails.open = true;
				}
			} else if (text) {
				if (!body) {
					body = document.createElement('div');
					body.className = 'subagent-card-body';
					el.appendChild(body);
				}
				body.textContent = text;
			}
			if (jobId) {
				D.state.subagentJobCards.delete(jobId);
			}
		} else {
			el = document.createElement('div');
			const cardState = isPartial ? 'msg-subagent-partial' : success ? 'msg-subagent-done' : 'msg-subagent-failed';
			el.className = `msg-subagent-card ${cardState}`;
			if (!success || isPartial) {
				fn.markChatIssueElement?.(el);
			}
			el.setAttribute('role', 'note');
			const title = document.createElement('div');
			title.className = 'subagent-card-title';
			title.textContent = `Sub-agent (${type}) — ${success ? 'done' : 'failed'}`;
			el.appendChild(title);
			if (summary || errMsg) {
				const body = document.createElement('div');
				body.className = 'subagent-card-body';
				body.textContent = success ? summary : errMsg;
				el.appendChild(body);
			}
			fn.mountSubagentCard(el);
		}
		if (isExecutor && jobId) {
			D.state.activeExecutorJobIds.delete(jobId);
			if (D.state.executorCaptures.has(jobId)) {
				fn.endExecutorCapture(jobId);
			}
		}
		fn.scrollLog();
	};

})(globalThis.DroxChat);
