/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	/** Phases affichées au même retrait que les outils (Read, Ran, …). */
	const INDENTED_PHASES = new Set(['reasoning', 'internal_reasoning']);
	/** Phases regroupées dans un seul bloc « Exploring » (lecture + réflexion native). */
	const EXPLORE_PHASES = new Set(['analyzing', 'reading', 'acting', 'internal_reasoning', 'reasoning']);
	const EXPLORE_REASONING_PHASES = new Set(['internal_reasoning', 'reasoning']);
	/** Prose assistant dans Exploring = réflexion (jamais promue telle quelle vers le fil). */
	const EXPLORE_INTERNAL_PROSE_PHASES = EXPLORE_PHASES;
	const EXPLORE_READ_VERBS = new Set(['Read', 'Wrote', 'Edited', 'Edited notebook', 'Fetched']);
	const EXPLORE_SEARCH_VERBS = new Set(['Searched', 'Searched web', 'Listed', 'LSP search symbol', 'LSP diagnostics']);
	/** Taille minimale pour traiter un bloc assistant comme réponse finale utilisateur. */
	const FINAL_ANSWER_MIN_CHARS = 40;

	/** Prose méta (« The user asked… », « Je marque t3… ») — pas pour le fil principal. */
	fn.isModelThinkingMonologue = function (text) {
		const t = String(text || '').trim();
		if (t.length < 12) {
			return false;
		}
		const patterns = [
			/^The user (asked|wants|requested|has asked)/i,
			/^Now I (need to|should|must|will)/i,
			/^I've completed all tasks/i,
			/^I have completed all tasks/i,
			/^Let me (verify|check|mark|read)/i,
			/^Good,\s+I've\b/i,
			/^I (will|need to|should) (provide|produce|write|give)/i,
			/^C'est la tâche finale/i,
			/^Bon,\s+j'ai les résultats/i,
			/^Je n'ai pas besoin de déléguer/i,
			/^Laissez-moi vérifier/i,
			/^I am (now|going to) (in|entering)/i,
			/^This is the final synthesis/i,
		];
		if (patterns.some((re) => re.test(t))) {
			return true;
		}
		if (
			t.length < 320 &&
			/\b(todo_write|delegate_executor|\[phase:\s*answering\]|mark t\d|task_id)\b/i.test(t)
		) {
			return true;
		}
		return false;
	};

	fn.hasFinalAnswerOnLog = function () {
		return Boolean(
			D.dom.logEl.querySelector(':scope > .msg.assistant.drox-final-answer') ||
			D.dom.logEl.querySelector(
				':scope > .drox-run-strip .drox-run-answer .msg.assistant.drox-final-answer',
			),
		);
	};

	/** Un seul sticky user : le dernier message utilisateur du fil. */
	fn.refreshLastUserStickyRow = function () {
		if (!D.dom.logEl) {
			return;
		}
		const rows = [...D.dom.logEl.querySelectorAll(':scope > .msg-row-user')];
		for (const row of rows) {
			row.classList.remove('is-last-user-sticky');
		}
		const last = rows.length > 0 ? rows[rows.length - 1] : null;
		if (last) {
			last.classList.add('is-last-user-sticky');
		}
	};

	fn.attachMessageRevertAction = function (rowEl) {
		if (!rowEl || rowEl.querySelector('.msg-revert-to-here')) {
			return;
		}
		const msgId = String(rowEl.dataset?.msgId || '').trim();
		if (!msgId) {
			return;
		}
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'msg-revert-to-here';
		btn.textContent = 'Restore here';
		btn.title = 'Restore workspace to this message';
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			D.vscode.postMessage({ type: 'revertToMessage', messageId: msgId });
		});
		rowEl.appendChild(btn);
	};

	fn.tuckElementIntoExploreReasoning = function (el) {
		if (!el?.isConnected) {
			return;
		}
		if (typeof fn.hasLinearRunStripsOnLog === 'function' && fn.hasLinearRunStripsOnLog()) {
			return;
		}
		if (!D.state.exploreBodyEl) {
			fn.openExploreBundle();
			fn.compactExploreBundleKeepDom();
			if (D.state.exploreBundleEl) {
				D.state.exploreBundleEl.open = false;
			}
		}
		if (D.state.exploreBodyEl) {
			fn.ensureExploreReflectionHost().appendChild(el);
			el.classList.add('drox-explore-reasoning-msg');
			el.classList.remove('drox-final-answer', 'streaming');
		}
	};

	fn.tuckPostFinalAnswerNoiseIntoExplore = function () {
		const final = D.dom.logEl.querySelector(':scope > .msg.assistant.drox-final-answer');
		if (!final) {
			return;
		}
		let node = final.nextElementSibling;
		while (node) {
			const next = node.nextElementSibling;
			const isNoise =
				(node.classList?.contains('msg') && node.classList.contains('assistant')) ||
				(node.classList?.contains('phase-block') &&
					(node.classList.contains('phase-reasoning') ||
						node.classList.contains('phase-internal_reasoning') ||
						node.classList.contains('phase-reading') ||
						node.classList.contains('phase-analyzing') ||
						node.classList.contains('phase-acting')));
			if (isNoise) {
				fn.tuckElementIntoExploreReasoning(node);
			}
			node = next;
		}
	};

	fn.ensureFinalAnswerIsLastOnLog = function () {
		const finals = [...D.dom.logEl.querySelectorAll(':scope > .msg.assistant.drox-final-answer')];
		if (finals.length === 0) {
			return;
		}
		const final = finals[finals.length - 1];
		for (let i = 0; i < finals.length - 1; i++) {
			finals[i].classList.remove('drox-final-answer');
			fn.tuckElementIntoExploreReasoning(finals[i]);
		}
		D.dom.logEl.appendChild(final);
	};

	/** Fin de run : réponse finale en bas, réflexion dans Exploring replié. */
	fn.finalizeRunPresentation = function () {
		fn.shedOrphanReasoningFromLog();
		if (typeof fn.hasLinearRunStripsOnLog === 'function' && fn.hasLinearRunStripsOnLog()) {
			if (typeof fn.parkAllLinearFinalAnswers === 'function') {
				fn.parkAllLinearFinalAnswers();
			}
			D.state.assistantEl = null;
			fn.scrollLog(true);
			return;
		}
		fn.tuckPostFinalAnswerNoiseIntoExplore();
		fn.ensureFinalAnswerIsLastOnLog();
		D.state.assistantEl = null;
		fn.scrollLog(true);
	};
	fn.ensureUserMessageViewer = function () {
		if (D.dom.userMsgViewerOverlay) {
			return;
		}
		const overlay = document.createElement('div');
		overlay.className = 'drox-user-msg-viewer-overlay';
		overlay.hidden = true;
		const panel = document.createElement('div');
		panel.className = 'drox-user-msg-viewer-panel';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-modal', 'true');
		panel.setAttribute('aria-label', 'Message utilisateur');
		const header = document.createElement('div');
		header.className = 'drox-user-msg-viewer-header';
		const title = document.createElement('span');
		title.className = 'drox-user-msg-viewer-title';
		title.textContent = 'Votre message';
		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'drox-user-msg-viewer-close';
		closeBtn.textContent = 'Fermer';
		closeBtn.setAttribute('aria-label', 'Fermer');
		header.appendChild(title);
		header.appendChild(closeBtn);
		const content = document.createElement('div');
		content.className = 'drox-user-msg-viewer-content';
		panel.appendChild(header);
		panel.appendChild(content);
		overlay.appendChild(panel);
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				fn.closeUserMessageViewer();
			}
		});
		closeBtn.addEventListener('click', () => fn.closeUserMessageViewer());
		panel.addEventListener('click', (e) => e.stopPropagation());
		if (!D.state.userMsgViewerEscapeBound) {
			D.state.userMsgViewerEscapeBound = true;
			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && D.dom.userMsgViewerOverlay && !D.dom.userMsgViewerOverlay.hidden) {
					fn.closeUserMessageViewer();
				}
			});
		}
		document.body.appendChild(overlay);
		D.dom.userMsgViewerOverlay = overlay;
		D.dom.userMsgViewerContent = content;
	};

	fn.openUserMessageViewer = function (text) {
		fn.ensureUserMessageViewer();
		D.dom.userMsgViewerContent.textContent = String(text || '');
		D.dom.userMsgViewerOverlay.hidden = false;
	};

	fn.closeUserMessageViewer = function () {
		if (D.dom.userMsgViewerOverlay) {
			D.dom.userMsgViewerOverlay.hidden = true;
		}
	};

	fn.bindUserMessageExpand = function (row, textSpan, fullText) {
		const markExpandable = () => {
			if (!textSpan.classList.contains('is-clamped')) {
				return;
			}
			const overflows = textSpan.scrollHeight > textSpan.clientHeight + 2;
			if (overflows) {
				row.classList.add('msg-user-expandable');
				row.setAttribute('title', 'Cliquer pour voir le message complet');
				row.setAttribute('tabindex', '0');
				row.setAttribute('role', 'button');
			}
		};
		requestAnimationFrame(() => requestAnimationFrame(markExpandable));
		const onOpen = (e) => {
			if (!row.classList.contains('msg-user-expandable')) {
				return;
			}
			if (e.target.closest('.msg-ref-link, .msg-paste-link, .msg-paste-terminal')) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			fn.openUserMessageViewer(fullText);
		};
		row.addEventListener('click', onOpen);
		row.addEventListener('keydown', (e) => {
			if (
				(e.key === 'Enter' || e.key === ' ') &&
				row.classList.contains('msg-user-expandable')
			) {
				e.preventDefault();
				fn.openUserMessageViewer(fullText);
			}
		});
	};

	fn.isLogNearBottom = function (el, thresholdPx) {
		if (!el) {
			return true;
		}
		const threshold = typeof thresholdPx === 'number' ? thresholdPx : 56;
		return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
	};

	fn.bindThinkingScrollEl = function (el) {
		if (!el || el.dataset.thinkingScrollBound === '1') {
			return;
		}
		el.dataset.thinkingScrollBound = '1';
		D.state.thinkingScrollStick.set(el, true);
		el.addEventListener(
			'scroll',
			() => {
				D.state.thinkingScrollStick.set(el, fn.isLogNearBottom(el, 28));
			},
			{ passive: true },
		);
	};

	fn.scrollThinkingEl = function (el, force) {
		if (!el) {
			return;
		}
		requestAnimationFrame(() => {
			const stick = D.state.thinkingScrollStick.get(el);
			if (force === true || stick !== false) {
				el.scrollTop = el.scrollHeight;
			}
		});
	};

	fn.scrollLog = function (force) {
		requestAnimationFrame(() => {
			const el = D.dom.logEl;
			if (!el) {
				return;
			}
			if (force === true || D.state.logStickToBottom) {
				el.scrollTop = el.scrollHeight;
			}
		});
	}

	fn.basenameForRef = function (path) {
		const norm = String(path || '').replaceAll('\\', '/').replace(/^\.\//, '');
		const parts = norm.split('/').filter(Boolean);
		if (parts.length === 0) {
			return path || 'file';
		}
		return parts[parts.length - 1];
	}

	fn.renderUserMessage = function (text, refs, pastes, images) {
		const row = document.createElement('div');
		row.className = 'msg-row-user msg user msg-user-bubble';

		const body = document.createElement('div');
		body.className = 'msg-user-body';
		const trimmed = String(text || '').trim();
		if (trimmed) {
			const textSpan = document.createElement('span');
			textSpan.className = 'msg-user-text';
			textSpan.textContent = trimmed;
			textSpan.classList.add('is-clamped');
			fn.bindUserMessageExpand(row, textSpan, trimmed);
			body.appendChild(textSpan);
		}
		for (const ref of refs || []) {
			const link = document.createElement('button');
			link.type = 'button';
			link.className = 'msg-ref-link';
			const path = ref.rel || ref.abs || ref.uri || '';
			const name = ref.label || fn.basenameForRef(path);
			const label = document.createElement('span');
			label.className = 'msg-ref-link-label';
			label.textContent = ref.kind === 'directory' ? `${name}/` : name;
			link.title = ref.abs || ref.uri || path;
			link.appendChild(label);
			link.addEventListener('click', (e) => {
				e.stopPropagation();
				const openPath = ref.abs || (ref.uri?.startsWith('file://') ? fn.fileUriToPath(ref.uri) : ref.uri);
				if (openPath) {
					D.vscode.postMessage({ type: 'openFile', filePath: openPath });
				}
			});
			body.appendChild(link);
		}

		for (const p of pastes || []) {
			const link = document.createElement('button');
			link.type = 'button';
			const isTerminal = p.kind === 'terminal';
			link.className = isTerminal ? 'msg-ref-link msg-paste-link msg-paste-terminal' : 'msg-ref-link msg-paste-link';
			const lineRef = fn.pasteLineRef(p.startLine, p.endLine);
			const refPath = p.relPath ?? p.absPath ?? '';
			const label = document.createElement('span');
			label.className = 'msg-ref-link-label';
			label.textContent = isTerminal
				? `${refPath || 'Terminal'} · ${lineRef}`
				: `${fn.basenameForRef(refPath)} · ${lineRef}`;
			link.title = isTerminal
				? `Terminal — ${lineRef}`
				: `${refPath} — ${lineRef}`;
			link.appendChild(label);
			link.addEventListener('click', (e) => {
				e.stopPropagation();
				D.vscode.postMessage({
					type: 'openPasteSource',
					kind: p.kind,
					absPath: p.absPath,
					relPath: p.relPath,
					startLine: p.startLine,
					endLine: p.endLine,
				});
			});
			body.appendChild(link);
		}

		if (body.childElementCount > 0) {
			row.appendChild(body);
		}

		if (images && images.length > 0) {
			const gallery = document.createElement('div');
			gallery.className = 'msg-user-images';
			for (const img of images) {
				const wrap = document.createElement('div');
				wrap.className = 'msg-user-image';
				wrap.title = img.relPath || '';
				const el = document.createElement('img');
				const src = String(img.dataUrl || '').trim();
				el.src = src;
				el.alt = img.relPath || 'image';
				if (!src.startsWith('data:')) {
					el.classList.add('msg-user-image-broken');
				}
				wrap.appendChild(el);
				gallery.appendChild(wrap);
			}
			row.appendChild(gallery);
		}

		return row;
	}

	fn.appendSubagentBadge = function (parent, text, className) {
		const b = document.createElement('span');
		b.className = `subagent-badge ${className}`;
		b.textContent = text;
		parent.appendChild(b);
	};

	fn.mountSubagentCard = function (el) {
		if (D.state.exploreBodyEl) {
			fn.ensureExploreMetaTray().appendChild(el);
			if (D.state.exploreMetaTrayEl) {
				D.state.exploreMetaTrayEl.open = true;
			}
		} else {
			D.dom.logEl.appendChild(el);
		}
		fn.scrollExploreBody();
		fn.scrollLog();
	};

	fn.highlightTodoTask = function (taskId, statusHint) {
		const id = String(taskId || '').trim();
		if (!id || !D.state.currentTodoBlockEl) {
			return;
		}
		for (const li of D.state.currentTodoBlockEl.querySelectorAll('.todo-item')) {
			li.classList.remove('todo-active');
			if (li.dataset.id === id) {
				li.classList.add('todo-active');
				if (statusHint === 'running') {
					li.classList.add('todo-progress');
				}
			}
		}
	};

	fn.renderOrchestrationRole = function (role) {
		const r = String(role || '').trim().toLowerCase();
		if (r !== 'architect' && r !== 'executor') {
			return;
		}
		if (r === 'executor') {
			return;
		}
		const el = document.createElement('div');
		el.className = `msg-orchestration-role msg-orchestration-${r}`;
		el.setAttribute('role', 'status');
		const label = r === 'architect' ? 'Architect' : 'Executor';
		el.textContent =
			r === 'architect'
				? `${label} — planning and delegation`
				: `${label} — running task`;
		D.dom.logEl.appendChild(el);
		fn.scrollLog();
	};

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
		fn.scrollExploreBody();
		fn.scrollLog();
	};

	/** Erreur / notice moteur pendant Exploring — panneau meta (pas sur la prose). */
	fn.appendExploreNotice = function (text) {
		const msg = String(text || '').trim();
		if (!msg) {
			return;
		}
		const el = document.createElement('div');
		el.className = D.state.exploreBodyEl ? 'msg-explore-notice' : 'msg error';
		el.setAttribute('role', 'alert');
		el.textContent = msg;
		fn.appendChatIssue?.(el, msg);
		fn.scrollExploreBody(true);
		fn.scrollLog(true);
	};

	fn.renderLoopIntervention = function (payload) {
		const level = String(payload?.level ?? 'warn');
		const text = String(payload?.userMessage ?? payload?.user_message ?? '').trim();
		if (!text) {
			return;
		}
		const el = document.createElement('div');
		const levelClass = (level.replace(/[^a-z0-9_-]/gi, '') || 'warn').toLowerCase();
		el.className = `msg-loop-intervention msg-loop-intervention-${levelClass}`;
		el.setAttribute('role', 'status');
		el.textContent = text;
		if (levelClass === 'warn' || levelClass === 'abort') {
			fn.appendChatIssue?.(el, text);
		} else if (D.state.exploreBodyEl) {
			const inner = fn.ensureExploreMetaTray();
			inner.appendChild(el);
		} else {
			D.dom.logEl.appendChild(el);
		}
		fn.scrollExploreBody(true);
		fn.scrollLog(true);
	};

	fn.appendMemoryChip = function (payload) {
		fn.finalizeAssistant();
		const div = document.createElement('div');
		div.className = 'msg-memory-chip';

		const icon = document.createElement('span');
		icon.className = 'memory-chip-icon';
		icon.setAttribute('aria-hidden', 'true');
		div.appendChild(icon);

		const label = document.createElement('span');
		label.className = 'memory-chip-label';
		label.textContent = 'Context saved';
		div.appendChild(label);

		const slug = String(payload?.slug ?? '');
		const objective = String(payload?.objective ?? '').trim();
		const path = String(payload?.path ?? '');
		const summary = objective ? `${slug} — ${objective}` : slug;

		const text = document.createElement('span');
		text.className = 'memory-chip-text';
		text.textContent = summary;
		div.appendChild(text);

		if (path) {
			const link = document.createElement('a');
			link.className = 'memory-chip-link';
			link.textContent = 'open';
			link.href = '#';
			link.title = path;
			link.addEventListener('click', (e) => {
				e.preventDefault();
				D.vscode.postMessage({ type: 'openFile', filePath: path });
			});
			div.appendChild(link);
		}

		D.dom.logEl.appendChild(div);
		fn.scrollLog();
	}

	fn.currentContainer = function () {
		return D.state.currentPhaseBodyEl ?? D.dom.logEl;
	}

	fn.isExploreStreaming = function () {
		return Boolean(D.state.exploreBundleEl?.classList.contains('streaming'));
	}

	/** Ouvre ou réactive le bundle Exploring (scroll interne pendant le stream). */
	fn.ensureExploreBundleActive = function (phaseHint) {
		if (D.state.exploreBundleEl) {
			D.state.exploreBundleEl.classList.add('streaming');
			D.state.exploreBundleEl.classList.remove('drox-explore-compact');
			D.state.exploreBundleEl.open = true;
			D.state.currentPhaseEl = D.state.exploreBundleEl;
			D.state.currentPhaseBodyEl = D.state.exploreBodyEl;
			if (phaseHint) {
				D.state.currentPhase = phaseHint;
			}
			return D.state.exploreBodyEl;
		}
		if (phaseHint) {
			D.state.currentPhase = phaseHint;
		}
		return fn.openExploreBundle();
	}

	fn.isExploreToolPayload = function (payload) {
		const name = String(payload.name ?? '');
		const verb = String(payload.verb ?? '');
		if (
			name === 'file_read' ||
			name === 'glob' ||
			name === 'grep' ||
			name === 'lsp' ||
			name === 'web_search' ||
			name === 'web_fetch' ||
			name === 'workspace_map_read' ||
			name === 'memory_read' ||
			name === 'memory_list' ||
			name === 'task' ||
			name === 'bash' ||
			name === 'list_mcp_resources' ||
			name === 'read_mcp_resource'
		) {
			return true;
		}
		return (
			EXPLORE_READ_VERBS.has(verb) ||
			EXPLORE_SEARCH_VERBS.has(verb) ||
			verb === 'Ran' ||
			verb.startsWith('LSP ')
		);
	}

	fn.trackExploreTool = function (payload) {
		const stats = D.state.exploreStats;
		if (!stats) {
			return;
		}
		const verb = String(payload.verb ?? '');
		const target = String(payload.target ?? '').trim();
		if (EXPLORE_READ_VERBS.has(verb) && target) {
			stats.files.add(target);
		} else if (EXPLORE_SEARCH_VERBS.has(verb)) {
			stats.searches++;
		} else if (verb === 'Ran' || verb.startsWith('LSP ')) {
			stats.searches++;
		}
	}

	fn.formatExploreSummary = function (stats) {
		const files = stats.files.size;
		const searches = stats.searches;
		const fileWord = files === 1 ? 'file' : 'files';
		const searchWord = searches === 1 ? 'search' : 'searches';
		if (files > 0 && searches > 0) {
			return `Explored ${files} ${fileWord}, ${searches} ${searchWord}`;
		}
		if (files > 0) {
			return `Explored ${files} ${fileWord}`;
		}
		if (searches > 0) {
			return `Explored ${searches} ${searchWord}`;
		}
		return 'Explored';
	}

	fn.scrollExploreBody = function (force) {
		const body = D.state.exploreBodyEl;
		if (!body) {
			return;
		}
		requestAnimationFrame(() => {
			if (force === true || D.state.logStickToBottom) {
				body.scrollTop = body.scrollHeight;
			}
		});
	}

	/** Panneau replié : re-perspective, sous-agents (évite le chevauchement avec la prose stream). */
	fn.ensureExploreMetaTray = function () {
		fn.ensureExploreBundleActive();
		if (D.state.exploreMetaInnerEl?.isConnected) {
			return D.state.exploreMetaInnerEl;
		}
		const tray = document.createElement('details');
		tray.className = 'drox-explore-meta-tray';
		const summary = document.createElement('summary');
		summary.className = 'drox-explore-meta-summary';
		summary.textContent = 'Contexte moteur';
		const inner = document.createElement('div');
		inner.className = 'drox-explore-meta-inner';
		tray.appendChild(summary);
		tray.appendChild(inner);
		if (D.state.exploreBodyEl.firstChild) {
			D.state.exploreBodyEl.insertBefore(tray, D.state.exploreBodyEl.firstChild);
		} else {
			D.state.exploreBodyEl.appendChild(tray);
		}
		D.state.exploreMetaTrayEl = tray;
		D.state.exploreMetaInnerEl = inner;
		return inner;
	}

	fn.ensureExploreReflectionHost = function () {
		fn.ensureExploreBundleActive();
		if (D.state.exploreReflectionHostEl?.isConnected) {
			return D.state.exploreReflectionHostEl;
		}
		const host = document.createElement('div');
		host.className = 'drox-explore-reflection-host';
		const anchor = D.state.exploreToolsTrayEl;
		if (anchor?.parentElement === D.state.exploreBodyEl) {
			D.state.exploreBodyEl.insertBefore(host, anchor);
		} else if (D.state.exploreMetaTrayEl?.parentElement === D.state.exploreBodyEl) {
			D.state.exploreMetaTrayEl.after(host);
		} else {
			D.state.exploreBodyEl.appendChild(host);
		}
		D.state.exploreReflectionHostEl = host;
		return host;
	}

	fn.ensureExploreToolsTray = function () {
		fn.ensureExploreBundleActive();
		if (D.state.exploreToolsTrayEl?.isConnected) {
			return D.state.exploreToolsInnerEl;
		}
		const tray = document.createElement('details');
		tray.className = 'drox-explore-tools-tray';
		const traySummary = document.createElement('summary');
		traySummary.className = 'drox-explore-tools-summary';
		traySummary.textContent = '';
		const inner = document.createElement('div');
		inner.className = 'drox-explore-tools-inner';
		tray.appendChild(traySummary);
		tray.appendChild(inner);
		tray.hidden = true;
		D.state.exploreBodyEl.appendChild(tray);
		D.state.exploreToolsTrayEl = tray;
		D.state.exploreToolsInnerEl = inner;
		D.state.exploreToolLineCount = 0;
		D.state.exploreToolsTrayState = null;
		fn.ensureExploreToolsTrayState?.();
		return inner;
	}

	fn.updateExploreToolsSummary = function () {
		const summary = D.state.exploreToolsTrayEl?.querySelector('.drox-explore-tools-summary');
		if (!summary) {
			return;
		}
		const n = D.state.exploreToolLineCount || 0;
		const label = n === 1 ? '1 outil' : `${n} outils`;
		summary.textContent = label;
		summary.setAttribute('aria-label', label);
		if (D.state.exploreToolsTrayEl) {
			D.state.exploreToolsTrayEl.hidden = n === 0;
		}
	}

	fn.openExploreBundle = function () {
		if (D.state.exploreBundleEl) {
			return D.state.exploreBodyEl;
		}
		const details = document.createElement('details');
		details.className = 'phase-block msg-ai-frame drox-explore-bundle streaming';
		details.open = true;
		const summary = document.createElement('summary');
		summary.className = 'phase-summary';
		fn.setPhaseSummaryLabel(summary, 'Exploring');
		const body = document.createElement('div');
		body.className = 'phase-body drox-explore-scroll';
		details.appendChild(summary);
		details.appendChild(body);
		D.dom.logEl.appendChild(details);
		D.state.exploreBundleEl = details;
		D.state.exploreBodyEl = body;
		D.state.exploreSummaryEl = summary;
		D.state.exploreStats = { files: new Set(), searches: 0 };
		D.state.exploreReflectionHostEl = null;
		D.state.exploreToolsTrayEl = null;
		D.state.exploreToolsInnerEl = null;
		D.state.exploreToolLineCount = 0;
		D.state.exploreMetaTrayEl = null;
		D.state.exploreMetaInnerEl = null;
		fn.resetCollapsibleTrayState?.();
		fn.ensureExploreMetaTray();
		fn.ensureExploreReflectionHost();
		fn.ensureExploreToolsTray();
		D.state.currentPhaseEl = details;
		D.state.currentPhaseBodyEl = body;
		if (D.state.busy) {
			fn.showActivityOnSummary(summary);
		}
		fn.scrollLog();
		return body;
	}

	/** Replie Exploring en résumé compact mais garde le DOM (pensées / thinking tardifs). */
	fn.compactExploreBundleKeepDom = function () {
		if (!D.state.exploreBundleEl) {
			return;
		}
		const details = D.state.exploreBundleEl;
		const summary = D.state.exploreSummaryEl;
		const stats = D.state.exploreStats;
		details.classList.remove('streaming');
		details.classList.add('drox-explore-compact');
		if (summary && stats) {
			fn.setPhaseSummaryLabel(summary, fn.formatExploreSummary(stats));
		}
		for (const el of details.querySelectorAll('.drox-explore-thought.streaming')) {
			el.classList.remove('streaming');
		}
		if (D.state.currentPhaseEl === details) {
			D.state.currentPhaseEl = details;
			D.state.currentPhaseBodyEl = D.state.exploreBodyEl;
		}
	}

	fn.closeExploreBundle = function () {
		if (!D.state.exploreBundleEl) {
			return;
		}
		const details = D.state.exploreBundleEl;
		const summary = D.state.exploreSummaryEl;
		const stats = D.state.exploreStats;
		const body = D.state.exploreBodyEl;
		details.classList.remove('streaming');
		details.classList.add('drox-explore-compact');
		if (summary && stats) {
			fn.setPhaseSummaryLabel(summary, fn.formatExploreSummary(stats));
		}
		if (body && body.childElementCount === 0 && body.textContent.trim() === '') {
			details.remove();
		} else {
			details.open = false;
		}
		if (D.state.currentPhaseEl === details) {
			D.state.currentPhaseEl = null;
			D.state.currentPhaseBodyEl = null;
		}
		D.state.exploreBundleEl = null;
		D.state.exploreBodyEl = null;
		D.state.exploreSummaryEl = null;
		D.state.exploreStats = null;
		D.state.exploreReflectionHostEl = null;
		D.state.exploreToolsTrayEl = null;
		D.state.exploreToolsInnerEl = null;
		D.state.exploreToolLineCount = 0;
		D.state.exploreMetaTrayEl = null;
		D.state.exploreMetaInnerEl = null;
		fn.resetCollapsibleTrayState?.();
	}

	/** Fermeture légère (pensée native) — ne replie pas le bundle Exploring. */
	fn.closePhaseMarker = function () {
		if (fn.isExecutorUiContext()) {
			return;
		}
		fn.hideActivity();
		if (
			D.state.currentPhaseEl &&
			D.state.exploreBundleEl &&
			D.state.currentPhaseEl !== D.state.exploreBundleEl &&
			D.state.currentPhaseEl.parentElement === D.state.exploreBodyEl
		) {
			fn.closeNestedExplorePhase();
		}
	}

	fn.closeNestedExplorePhase = function () {
		if (
			D.state.currentPhaseEl &&
			D.state.exploreBundleEl &&
			D.state.currentPhaseEl !== D.state.exploreBundleEl &&
			D.state.currentPhaseEl.parentElement === D.state.exploreBodyEl
		) {
			D.state.currentPhaseEl.classList.remove('streaming');
			const keepOpen =
				D.state.currentPhase != null && INDENTED_PHASES.has(D.state.currentPhase);
			if (!D.state.busy && !keepOpen) {
				D.state.currentPhaseEl.open = false;
			}
			D.state.currentPhaseEl = D.state.exploreBundleEl;
			D.state.currentPhaseBodyEl = D.state.exploreBodyEl;
		}
	}

	fn.openNestedPhaseInExplore = function (phase) {
		const meta = D.const.PHASE_META[phase] ?? { label: phase };
		const details = document.createElement('details');
		details.className = `phase-block msg-ai-frame phase-${phase} drox-explore-thought streaming`;
		details.open = true;
		const summary = document.createElement('summary');
		summary.className = 'phase-summary';
		fn.setPhaseSummaryLabel(summary, meta.label);
		const body = document.createElement('div');
		body.className = 'phase-body';
		details.appendChild(summary);
		details.appendChild(body);
		const tray = D.state.exploreToolsTrayEl;
		if (tray?.parentElement === D.state.exploreBodyEl) {
			D.state.exploreBodyEl.insertBefore(details, tray);
		} else {
			D.state.exploreBodyEl.appendChild(details);
		}
		D.state.currentPhase = phase;
		D.state.currentPhaseEl = details;
		D.state.currentPhaseBodyEl = body;
		fn.scrollExploreBody();
		fn.scrollLog();
		return body;
	}

	fn.closeCurrentPhase = function () {
		fn.hideActivity();
		if (
			D.state.currentPhaseEl &&
			D.state.exploreBodyEl &&
			D.state.currentPhaseEl !== D.state.exploreBundleEl &&
			D.state.currentPhaseEl.parentElement === D.state.exploreBodyEl
		) {
			fn.closeNestedExplorePhase();
			D.state.currentPhase = null;
			return;
		}
		if (D.state.currentPhaseEl === D.state.exploreBundleEl) {
			fn.closeExploreBundle();
			D.state.currentPhase = null;
			return;
		}
		if (D.state.currentPhaseEl) {
			D.state.currentPhaseEl.classList.remove('streaming');
			const body = D.state.currentPhaseBodyEl;
			const isEmpty = body && body.childElementCount === 0 && body.textContent.trim() === '';
			const keepOpen =
				D.state.currentPhase != null && INDENTED_PHASES.has(D.state.currentPhase);
			if (isEmpty && D.state.currentPhaseEl.parentElement) {
				D.state.currentPhaseEl.remove();
			} else if (!keepOpen) {
				D.state.currentPhaseEl.open = false;
			}
			D.state.currentPhaseEl = null;
			D.state.currentPhaseBodyEl = null;
		}
		D.state.currentPhase = null;
	}

	fn.openPhaseBlock = function (phase) {
		const meta = D.const.PHASE_META[phase] ?? { label: phase };
		const details = document.createElement('details');
		const indentClass = INDENTED_PHASES.has(phase) ? ' drox-log-indent' : '';
		details.className = `phase-block msg-ai-frame phase-${phase}${indentClass} streaming`;
		details.open = true;
		const summary = document.createElement('summary');
		summary.className = 'phase-summary';
		fn.setPhaseSummaryLabel(summary, meta.label);
		const body = document.createElement('div');
		body.className = 'phase-body';
		details.appendChild(summary);
		details.appendChild(body);
		D.dom.logEl.appendChild(details);
		D.state.currentPhase = phase;
		D.state.currentPhaseEl = details;
		D.state.currentPhaseBodyEl = body;
		if (D.state.busy) {
			fn.showActivityOnSummary(summary);
		}
		fn.scrollLog();
		return body;
	}

	fn.assistantTextLength = function (el) {
		return (el?.dataset?.raw || el?.textContent || '').trim().length;
	}

	/** Courtes notes hors réflexion native (phase reading, etc.). */
	fn.promoteExploreAssistantsToAnswer = function () {
		if (fn.hasFinalAnswerOnLog()) {
			return;
		}
		const body = D.state.exploreBodyEl;
		if (!body) {
			return;
		}
		const assistants = [...body.querySelectorAll('.msg.assistant:not(.drox-explore-reasoning-msg)')];
		for (const el of assistants) {
			el.classList.remove('streaming');
			if (D.state.assistantEl && D.state.assistantEl.isConnected && D.state.assistantEl !== el) {
				if (D.state.assistantEl.classList.contains('drox-final-answer')) {
					fn.tuckElementIntoExploreReasoning(el);
					continue;
				}
				D.state.assistantEl.appendChild(document.createTextNode('\n\n'));
				while (el.firstChild) {
					D.state.assistantEl.appendChild(el.firstChild);
				}
				el.remove();
			} else {
				if (fn.hasFinalAnswerOnLog()) {
					fn.tuckElementIntoExploreReasoning(el);
				} else {
					D.dom.logEl.appendChild(el);
					D.state.assistantEl = el;
				}
			}
		}
		if (assistants.length > 0) {
			fn.scrollLog();
		}
	}

	fn.isExploreInternalProsePhase = function (phase) {
		return Boolean(phase && EXPLORE_INTERNAL_PROSE_PHASES.has(phase));
	}

	fn.hasVisibleAnswerOnLog = function () {
		for (const el of D.dom.logEl.querySelectorAll('.msg.assistant')) {
			if (el.closest('.drox-explore-bundle')) {
				continue;
			}
			if (
				el.classList.contains('drox-explore-reasoning-msg') ||
				el.classList.contains('drox-explore-reflection')
			) {
				continue;
			}
			if (fn.assistantTextLength(el) >= FINAL_ANSWER_MIN_CHARS) {
				return true;
			}
		}
		return false;
	}

	/** Découpe « pensée modèle » vs réponse utilisateur dans un même bloc. */
	fn.splitUserFacingAnswer = function (raw) {
		const text = String(raw || '').trim();
		if (!text) {
			return null;
		}
		const markers = [
			/\[phase:\s*answering\]\s*/i,
			/(?=Voici l['']analyse du projet)/i,
			/(?=Voici l['']analyse\b)/i,
			/(?=Voici comment\b)/i,
			/(?=Le background animé\b)/i,
			/(?=L['']animation\b)/i,
			/(?=##\s+Vue d['']ensemble)/i,
			/(?=##\s+[^\n])/,
			/(?=##\s+📊)/,
			/(?=##\s+Analyse du projet)/i,
			/(?=The user asked)/i,
			/(?=Now I need to provide)/i,
			/(?=\d+\.\s+\*\*)/,
		];
		let idx = -1;
		for (const re of markers) {
			const m = text.search(re);
			if (m >= 0 && (idx < 0 || m < idx)) {
				idx = m;
			}
		}
		if (idx < 0) {
			return null;
		}
		const head = text.slice(0, idx).trim();
		let tail = text.slice(idx).replace(/^\[phase:\s*answering\]\s*/i, '').trim();
		if (tail.length < FINAL_ANSWER_MIN_CHARS) {
			return null;
		}
		return { head, tail };
	}

	/** Dernière prose Exploring → fil principal si aucune réponse visible (reprise session). */
	fn.promoteLastExploreReflectionToAnswer = function () {
		if (fn.hasVisibleAnswerOnLog()) {
			return false;
		}
		const body = D.state.exploreBodyEl;
		if (!body) {
			return false;
		}
		const candidates = [
			...body.querySelectorAll(
				'.msg.assistant.drox-explore-reflection, .drox-explore-reflection-host .msg.assistant',
			),
		];
		if (candidates.length === 0) {
			return false;
		}
		let best = candidates[candidates.length - 1];
		let bestLen = fn.assistantTextLength(best);
		for (const el of candidates) {
			const len = fn.assistantTextLength(el);
			if (len > bestLen) {
				best = el;
				bestLen = len;
			}
		}
		if (bestLen < FINAL_ANSWER_MIN_CHARS) {
			return false;
		}
		const raw = best.dataset.raw || best.textContent || '';
		const split = fn.splitUserFacingAnswer(raw);
		if (split) {
			if (split.head) {
				best.dataset.raw = split.head;
				fn.setAssistantMarkdown(best, split.head);
				best.classList.add('drox-explore-reasoning-msg');
			} else {
				best.remove();
			}
			const answer = document.createElement('div');
			answer.className = 'msg assistant msg-ai-frame markdown';
			answer.dataset.raw = split.tail;
			fn.setAssistantMarkdown(answer, split.tail);
			D.dom.logEl.appendChild(answer);
			D.state.assistantEl = answer;
			fn.scrollLog(true);
			return true;
		}
		best.classList.remove('drox-explore-reasoning-msg', 'streaming');
		D.dom.logEl.appendChild(best);
		D.state.assistantEl = best;
		fn.scrollLog(true);
		return true;
	}

	/** Filet : extraire la queue « Voici l'analyse… » si le modèle a tout mis dans Exploring. */
	fn.splitAndPromoteUserFacingFromExplore = function () {
		const body = D.state.exploreBodyEl;
		if (!body || fn.hasVisibleAnswerOnLog()) {
			return;
		}
		const all = [...body.querySelectorAll('.msg.assistant')];
		for (let i = all.length - 1; i >= 0; i--) {
			const el = all[i];
			const raw = el.dataset.raw || el.textContent || '';
			const split = fn.splitUserFacingAnswer(raw);
			if (!split) {
				continue;
			}
			if (split.head) {
				el.dataset.raw = split.head;
				fn.setAssistantMarkdown(el, split.head);
				el.classList.add('drox-explore-reasoning-msg');
			} else {
				el.remove();
			}
			const answer = document.createElement('div');
			answer.className = 'msg assistant msg-ai-frame markdown';
			answer.dataset.raw = split.tail;
			fn.setAssistantMarkdown(answer, split.tail);
			D.dom.logEl.appendChild(answer);
			D.state.assistantEl = answer;
			fn.scrollLog();
			return;
		}
	}

	/** Passe en streaming réponse finale sur le fil principal (sans dump depuis Exploring). */
	/** Fin de reprise session — ne pas inventer de bundle « Explored » hors fil linéaire. */
	fn.finalizeSessionReplayUi = function () {
		D.state.answerStreamOnLog = false;
		fn.finalizeAssistant();
		const linear =
			typeof fn.hasLinearRunStripsOnLog === 'function' && fn.hasLinearRunStripsOnLog();
		if (linear) {
			if (typeof fn.parkAllLinearFinalAnswers === 'function') {
				fn.parkAllLinearFinalAnswers();
			}
			if (D.state.runStripEl?.isConnected && typeof fn.sealRunStrip === 'function') {
				fn.sealRunStrip(D.state.runStripEl);
			}
			D.state.assistantEl = null;
			D.state.logStickToBottom = true;
			fn.scrollLog(true);
			return;
		}
		fn.splitAndPromoteUserFacingFromExplore();
		fn.promoteLastExploreReflectionToAnswer();
		fn.promoteExploreAssistantsToAnswer();
		fn.finalizeRunPresentation();
		if (D.state.exploreBundleEl) {
			D.state.exploreBundleEl.classList.remove('streaming');
			fn.compactExploreBundleKeepDom();
			D.state.exploreBundleEl.open = false;
		}
		fn.closeCurrentPhase();
		D.state.logStickToBottom = true;
		fn.scrollExploreBody(true);
		fn.scrollLog(true);
	}

	/** Rattache ou retire les blocs reasoning orphelins sur le fil principal. */
	fn.shedOrphanReasoningFromLog = function () {
		const orphans = [
			...D.dom.logEl.querySelectorAll(
				':scope > .phase-block.phase-reasoning, :scope > .phase-block.phase-internal_reasoning',
			),
		];
		for (const el of orphans) {
			const body = el.querySelector('.phase-body');
			const hasContent =
				body && (body.childElementCount > 0 || body.textContent.trim().length > 0);
			if (!hasContent) {
				el.remove();
				continue;
			}
			if (D.state.exploreBodyEl) {
				fn.ensureExploreReflectionHost().appendChild(el);
				el.classList.add('drox-explore-reasoning-msg');
				el.open = false;
			}
		}
	};

	fn.markFinalAnswerElement = function (el) {
		if (!el) {
			return;
		}
		el.classList.remove('drox-explore-reasoning-msg', 'drox-explore-reflection');
		el.classList.add('drox-final-answer');
	};

	fn.beginAnsweringStream = function (initialAnswerText) {
		fn.shedOrphanReasoningFromLog();
		D.state.runHasFinalAnswer = true;
		if (D.state.answerStreamOnLog) {
			if (typeof initialAnswerText === 'string' && initialAnswerText.length > 0) {
				fn.appendDeltaToAnswerLog(initialAnswerText);
			}
			return;
		}
		D.state.answerStreamOnLog = true;
		D.state.currentPhase = 'answering';
		fn.splitAndPromoteUserFacingFromExplore();

		const exploreAssistant = D.state.assistantEl?.closest('.drox-explore-bundle')
			? D.state.assistantEl
			: null;

		if (exploreAssistant) {
			const raw = exploreAssistant.dataset.raw || exploreAssistant.textContent || '';
			const split = fn.splitUserFacingAnswer(raw);
			exploreAssistant.classList.remove('streaming', 'drox-explore-reflection');
			if (split) {
				if (split.head) {
					exploreAssistant.dataset.raw = split.head;
					fn.setAssistantMarkdown(exploreAssistant, split.head);
					exploreAssistant.classList.add('drox-explore-reasoning-msg');
				} else {
					exploreAssistant.remove();
				}
				const tail =
					typeof initialAnswerText === 'string' && initialAnswerText.length > 0
						? initialAnswerText
						: split.tail;
				D.state.assistantEl = document.createElement('div');
				D.state.assistantEl.className = 'msg assistant msg-ai-frame streaming markdown';
				D.state.assistantEl.dataset.raw = tail;
				fn.setAssistantMarkdown(D.state.assistantEl, tail);
				fn.markFinalAnswerElement(D.state.assistantEl);
				D.dom.logEl.appendChild(D.state.assistantEl);
			} else {
				D.dom.logEl.appendChild(exploreAssistant);
				D.state.assistantEl = exploreAssistant;
				if (typeof initialAnswerText === 'string' && initialAnswerText.length > 0) {
					exploreAssistant.dataset.raw = initialAnswerText;
					fn.setAssistantMarkdown(exploreAssistant, initialAnswerText);
				}
				exploreAssistant.classList.add('streaming');
			}
		} else {
			fn.finalizeAssistant();
			D.state.assistantEl = document.createElement('div');
			D.state.assistantEl.className = 'msg assistant msg-ai-frame streaming markdown';
			const seed =
				typeof initialAnswerText === 'string' && initialAnswerText.length > 0
					? initialAnswerText
					: '';
			D.state.assistantEl.dataset.raw = seed;
			fn.setAssistantMarkdown(D.state.assistantEl, seed);
			fn.markFinalAnswerElement(D.state.assistantEl);
			D.dom.logEl.appendChild(D.state.assistantEl);
		}

		if (D.state.assistantEl) {
			D.state.assistantEl.classList.add('streaming');
			fn.markFinalAnswerElement(D.state.assistantEl);
		}
		fn.compactExploreBundleKeepDom();
		if (D.state.exploreBundleEl) {
			D.state.exploreBundleEl.open = false;
		}
		if (D.state.busy && D.state.assistantEl) {
			fn.showActivityBeforeNode(D.state.assistantEl);
		}
		fn.scrollLog(true);
	}

	fn.enterPhase = function (phase) {
		if (fn.isExecutorUiContext() && EXPLORE_PHASES.has(phase)) {
			D.state.currentPhase = phase;
			return;
		}
		if (
			(D.state.answerStreamOnLog || D.state.runHasFinalAnswer) &&
			(phase === 'reasoning' || phase === 'internal_reasoning')
		) {
			if (D.state.runHasFinalAnswer) {
				if (!D.state.exploreBundleEl) {
					fn.openExploreBundle();
				}
				fn.compactExploreBundleKeepDom();
				if (D.state.exploreBundleEl) {
					D.state.exploreBundleEl.open = false;
				}
			}
			return;
		}
		if (phase === 'answering') {
			fn.beginAnsweringStream();
			return;
		}
		if (phase === 'done') {
			D.state.answerStreamOnLog = false;
			fn.finalizeAssistant();
			fn.splitAndPromoteUserFacingFromExplore();
			if (!fn.hasFinalAnswerOnLog()) {
				fn.promoteLastExploreReflectionToAnswer();
				fn.promoteExploreAssistantsToAnswer();
			}
			fn.finalizeRunPresentation();
			fn.compactExploreBundleKeepDom();
			fn.closeExploreBundle();
			fn.closeCurrentPhase();
			return;
		}
		if (EXPLORE_PHASES.has(phase)) {
			if (D.state.runHasFinalAnswer) {
				if (!D.state.exploreBundleEl) {
					fn.openExploreBundle();
				}
				fn.compactExploreBundleKeepDom();
				if (D.state.exploreBundleEl) {
					D.state.exploreBundleEl.open = false;
				}
				D.state.currentPhase = phase;
				D.state.currentPhaseBodyEl = D.state.exploreBodyEl;
				return;
			}
			D.state.answerStreamOnLog = false;
			fn.finalizeAssistantUnlessInExplore();
			if (phase === D.state.currentPhase && D.state.exploreBundleEl) {
				if (D.state.busy) {
					fn.showActivityOnCurrentPhaseSummary();
				}
				return;
			}
			fn.openExploreBundle();
			D.state.currentPhase = phase;
			D.state.currentPhaseBodyEl = D.state.exploreBodyEl;
			if (D.state.busy) {
				fn.showActivityOnCurrentPhaseSummary();
			}
			return;
		}
		if (phase === D.state.currentPhase && D.state.currentPhaseEl) {
			if (D.state.busy) {
				fn.showActivityOnCurrentPhaseSummary();
			}
			return;
		}
		fn.finalizeAssistant();
		fn.closeExploreBundle();
		fn.closeCurrentPhase();
		fn.openPhaseBlock(phase);
	}

	fn.appendMessageContainer = function (role) {
		if (role === 'assistant' && (D.state.answerStreamOnLog || D.state.currentPhase === 'answering')) {
			return D.dom.logEl;
		}
		return fn.currentContainer();
	}

	fn.appendMessage = function (role, text) {
		const el = document.createElement('div');
		if (role === 'assistant') {
			el.className = 'msg assistant msg-ai-frame markdown';
			fn.setAssistantMarkdown(el, text || '');
			if (D.state.runHasFinalAnswer || D.state.exploreBodyEl) {
				if (!D.state.exploreBodyEl) {
					fn.openExploreBundle();
					fn.compactExploreBundleKeepDom();
					if (D.state.exploreBundleEl) {
						D.state.exploreBundleEl.open = false;
					}
				}
				el.classList.add('drox-explore-reflection', 'drox-explore-reasoning-msg');
				fn.ensureExploreReflectionHost().appendChild(el);
				fn.scrollExploreBody();
				fn.scrollLog();
				return el;
			}
		} else if (role === 'user') {
			const userEl = fn.renderUserMessage(text || '', [], [], []);
			fn.appendMessageContainer(role).appendChild(userEl);
			fn.scrollLog();
			return userEl;
		} else {
			el.className = `msg ${role}`;
			el.textContent = text;
			if (role === 'error') {
				fn.appendChatIssue?.(el, text);
				fn.scrollLog();
				return el;
			}
		}
		fn.appendMessageContainer(role).appendChild(el);
		fn.scrollLog();
		return el;
	}

	fn.finalizeAssistant = function () {
		if (D.state.assistantEl) {
			D.state.assistantEl.classList.remove('streaming');
			D.state.assistantEl = null;
		}
	}

	/** Ne coupe pas le flux markdown en cours dans le bundle Exploring. */
	fn.finalizeAssistantUnlessInExplore = function () {
		if (D.state.assistantEl?.closest('.drox-explore-bundle')) {
			return;
		}
		fn.finalizeAssistant();
	}

	/** Un seul flux prose / pensée (native thinking + notes de phase) dans le host Exploring. */
	fn.resolveExploreProseContainer = function () {
		if (!D.state.exploreBodyEl) {
			return null;
		}
		return fn.ensureExploreReflectionHost();
	}

	fn.appendDeltaReasoningProminent = function (text) {
		if (!text) {
			return;
		}
		const container = fn.resolveExploreProseContainer();
		if (!container) {
			return;
		}
		if (
			!D.state.assistantEl ||
			D.state.assistantEl.parentElement !== container ||
			!D.state.assistantEl.classList.contains('drox-explore-reflection')
		) {
			D.state.assistantEl = document.createElement('div');
			D.state.assistantEl.className =
				'msg assistant msg-ai-frame streaming markdown drox-explore-reflection';
			D.state.assistantEl.dataset.raw = '';
			container.appendChild(D.state.assistantEl);
		}
		D.state.assistantEl.dataset.raw = (D.state.assistantEl.dataset.raw || '') + text;
		fn.setAssistantMarkdown(D.state.assistantEl, D.state.assistantEl.dataset.raw);
		const split = fn.splitUserFacingAnswer(D.state.assistantEl.dataset.raw);
		if (split && split.tail.length >= FINAL_ANSWER_MIN_CHARS) {
			if (split.head) {
				D.state.assistantEl.dataset.raw = split.head;
				fn.setAssistantMarkdown(D.state.assistantEl, split.head);
				D.state.assistantEl.classList.add('drox-explore-reasoning-msg');
			} else {
				D.state.assistantEl.remove();
				D.state.assistantEl = null;
			}
			fn.beginAnsweringStream(split.tail);
			return;
		}
		fn.scrollExploreBody();
		if (D.state.busy) {
			fn.showActivityOnCurrentPhaseSummary();
		}
		fn.scrollLog();
	}

	fn.appendDeltaExplore = function (text) {
		if (!text) {
			return;
		}
		if (D.state.busy && !D.state.exploreBodyEl && !D.state.answerStreamOnLog) {
			const hint =
				D.state.currentPhase && EXPLORE_PHASES.has(D.state.currentPhase)
					? D.state.currentPhase
					: D.state.currentPhase === 'internal_reasoning'
						? 'internal_reasoning'
						: 'reading';
			fn.ensureExploreBundleActive(hint);
		}
		if (D.state.exploreBodyEl && !D.state.answerStreamOnLog) {
			fn.appendDeltaReasoningProminent(text);
			return;
		}
		let container = fn.currentContainer();
		if (!D.state.assistantEl || D.state.assistantEl.parentElement !== container) {
			D.state.assistantEl = document.createElement('div');
			D.state.assistantEl.className = 'msg assistant msg-ai-frame streaming markdown';
			D.state.assistantEl.dataset.raw = '';
			container.appendChild(D.state.assistantEl);
		}
		D.state.assistantEl.dataset.raw = (D.state.assistantEl.dataset.raw || '') + text;
		fn.setAssistantMarkdown(D.state.assistantEl, D.state.assistantEl.dataset.raw);
		if (D.state.busy && D.state.currentPhaseEl?.classList.contains('streaming')) {
			fn.showActivityOnCurrentPhaseSummary();
		} else if (D.state.busy && D.state.assistantEl && !D.state.currentPhaseEl) {
			fn.showActivityBeforeNode(D.state.assistantEl);
		}
		fn.scrollLog();
	}

	fn.appendDeltaToAnswerLog = function (text) {
		if (!text) {
			return;
		}
		if (fn.isModelThinkingMonologue(text)) {
			fn.appendDeltaExplore(text);
			return;
		}
		if (!D.state.assistantEl || D.state.assistantEl.parentElement !== D.dom.logEl) {
			D.state.assistantEl = document.createElement('div');
			D.state.assistantEl.className = 'msg assistant msg-ai-frame streaming markdown';
			D.state.assistantEl.dataset.raw = '';
			fn.markFinalAnswerElement(D.state.assistantEl);
			D.dom.logEl.appendChild(D.state.assistantEl);
		}
		D.state.assistantEl.dataset.raw = (D.state.assistantEl.dataset.raw || '') + text;
		fn.setAssistantMarkdown(D.state.assistantEl, D.state.assistantEl.dataset.raw);
		fn.markFinalAnswerElement(D.state.assistantEl);
		if (D.state.busy) {
			fn.showActivityBeforeNode(D.state.assistantEl);
		}
		fn.scrollLog();
	}

	fn.stripStrayPhaseMarkersInAnswerStream = function (text) {
		return String(text || '')
			.replace(/\[phase:\s*(?:reasoning|internal_reasoning|reading|acting|analyzing|verifying|testing|planning|clarifying)\]\s*/gi, '')
			.replace(/\[phase:\s*done\]\s*/gi, '');
	};

	fn.appendDelta = function (text, executorJobId) {
		if (!text) {
			return;
		}
		if (fn.isExecutorUiContext()) {
			if (text && !/\[phase:\s*answering\]/i.test(text)) {
				fn.appendExecutorThinkingDelta(text, false, executorJobId);
			}
			return;
		}
		const answeringMarker = /\[phase:\s*answering\]\s*/i;
		const doneMarker = /\[phase:\s*done\]\s*/i;
		const answerMatch = text.match(answeringMarker);
		if (answerMatch && answerMatch.index !== undefined) {
			const before = text.slice(0, answerMatch.index);
			const after = text.slice(answerMatch.index + answerMatch[0].length);
			if (before) {
				fn.appendDeltaExplore(before);
			}
			fn.beginAnsweringStream(after || undefined);
			return;
		}
		if (D.state.answerStreamOnLog || D.state.currentPhase === 'answering') {
			const cleaned = fn.stripStrayPhaseMarkersInAnswerStream(text);
			if (!cleaned) {
				return;
			}
			if (fn.isModelThinkingMonologue(cleaned)) {
				fn.appendDeltaExplore(cleaned);
				return;
			}
			const doneMatch = cleaned.match(doneMarker);
			if (doneMatch && doneMatch.index !== undefined) {
				const before = cleaned.slice(0, doneMatch.index);
				if (before) {
					fn.appendDeltaToAnswerLog(before);
				}
				fn.finalizeAssistant();
				return;
			}
			fn.appendDeltaToAnswerLog(cleaned);
			return;
		}
		if (D.state.runHasFinalAnswer) {
			fn.appendDeltaExplore(text);
			return;
		}
		fn.appendDeltaExplore(text);
	}

	fn.createExploreToolLine = function (payload) {
		const inner = fn.ensureExploreToolsTray();
		const line = document.createElement('div');
		line.className = 'drox-explore-line running';
		const verb = String(payload.verb ?? 'Ran');
		const target = String(payload.target ?? '');
		line.dataset.verb = verb;
		line.dataset.target = target;
		line.innerHTML = `<strong>${verb}</strong>${target ? ` <span class="tool-target">${target}</span>` : ''}`;
		inner.appendChild(line);
		D.state.exploreToolLineCount += 1;
		const tray = fn.ensureExploreToolsTrayState?.();
		if (tray) {
			tray.count = D.state.exploreToolLineCount;
			if (!tray.trayEl.open) {
				fn.collapseCollapsibleTrayInner?.(inner);
			}
			fn.updateExploreToolsTraySummary(line);
		} else {
			fn.updateExploreToolsSummary();
		}
		fn.trackExploreTool(payload);
		fn.scrollExploreBody();
		fn.scrollLog();
		return line;
	}

	fn.toolUsesExploreLine = function (payload) {
		if (fn.isExecutorUiContext() || D.state.linearRunUi) {
			return false;
		}
		const verb = String(payload.verb ?? '');
		const name = String(payload.name ?? '');
		if (
			verb === 'Edited' ||
			verb === 'Wrote' ||
			verb === 'Edited notebook' ||
			name === 'file_edit' ||
			name === 'file_write' ||
			name === 'notebook_edit'
		) {
			return false;
		}
		if (!fn.isExploreToolPayload(payload)) {
			return false;
		}
		const phaseHint =
			name === 'glob' || name === 'workspace_map_read' || name === 'task'
				? 'analyzing'
				: 'reading';
		fn.ensureExploreBundleActive(phaseHint);
		return Boolean(D.state.exploreBodyEl);
	}

	fn.createToolBlock = function (payload) {
		if (fn.isExecutorUiContext() && fn.isExecutorCaptureActive()) {
			return fn.createExecutorActionLine(payload, payload?.executorJobId);
		}
		const toolName = String(payload.name ?? D.state.pendingToolName ?? '');
		if (fn.toolUsesExploreLine(payload)) {
			return fn.createExploreToolLine(payload);
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
	}

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
		if (block.classList.contains('drox-explore-line')) {
			if (payload.isError) {
				block.classList.add('error');
				fn.markChatIssueElement?.(block);
			}
			fn.updateExploreToolsTraySummary?.(block);
			fn.scrollExploreBody();
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
	}
})(globalThis.DroxChat);
