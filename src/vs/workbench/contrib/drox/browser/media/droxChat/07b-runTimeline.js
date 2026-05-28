/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file
// Fil lineaire append-only : plan, work, thinking, answer (pas de promotion Exploring).

(function (D) {
	const fn = D.fn;

	/** Outils read-only architecte (verify / carte) — section `plan`, pas `work`. */
	const ARCHITECT_VERIFY_TOOLS = new Set([
		'file_read',
		'grep',
		'lsp',
		'glob',
		'workspace_map_read',
	]);

	fn.isArchitectVerifyTool = function (name) {
		return ARCHITECT_VERIFY_TOOLS.has(String(name || '').trim());
	};

	D.state.linearRunUi = false;
	D.state.runStripEl = null;
	/** Dernier message user du run — le strip agent est inséré juste après. */
	D.state.runStripAnchorEl = null;

	/** Hauteur cumulée des bandeaux chrome (onglets + objectif) pour la pile sticky du fil. */
	fn.syncStickyStackLayout = function () {
		const chrome = document.getElementById('chat-chrome');
		const log = D.dom.logEl;
		if (!log) {
			return;
		}
		let chromeH = 0;
		if (chrome) {
			chromeH = Math.ceil(chrome.getBoundingClientRect().height);
		}
		document.documentElement.style.setProperty('--drox-chrome-h', `${chromeH}px`);
		let userH = 0;
		if (D.state.linearRunUi && D.state.runStripAnchorEl?.isConnected) {
			userH = Math.ceil(D.state.runStripAnchorEl.getBoundingClientRect().height);
		}
		log.style.setProperty('--drox-log-sticky-user-h', `${userH}px`);
	};

	fn.ensureRunStripConnected = function (strip) {
		if (!strip || strip.isConnected) {
			return;
		}
		const anchor = D.state.runStripAnchorEl;
		if (anchor?.isConnected) {
			anchor.insertAdjacentElement('afterend', strip);
			return;
		}
		// En mode run linéaire, on attend explicitement le message user courant
		// (anchorRunStripAfterUser). Ne pas fallback sur le "dernier user" historique.
		if (D.state.linearRunUi) {
			return;
		}
		const users = D.dom.logEl?.querySelectorAll(':scope > .msg-row-user');
		const lastUser = users?.length ? users[users.length - 1] : null;
		if (lastUser?.isConnected) {
			lastUser.insertAdjacentElement('afterend', strip);
			D.state.runStripAnchorEl = lastUser;
			return;
		}
		D.dom.logEl?.appendChild(strip);
	};

	fn.hasLinearRunStripsOnLog = function () {
		return Boolean(D.dom.logEl?.querySelector(':scope > .drox-run-strip'));
	};

	fn.nextRunStripId = function () {
		return typeof fn.randomId === 'function' ? fn.randomId() : `rs_${Date.now()}`;
	};

	fn.findRunStripById = function (stripId) {
		if (!stripId || !D.dom.logEl) {
			return null;
		}
		return D.dom.logEl.querySelector(`:scope > .drox-run-strip[data-strip-id="${stripId}"]`);
	};

	fn.parkLinearFinalAnswerElement = function (el) {
		if (!el?.classList?.contains('drox-final-answer')) {
			return;
		}
		const stripId = el.dataset.runStripId || '';
		let strip = stripId ? fn.findRunStripById(stripId) : null;
		if (!strip && D.state.runStripEl?.isConnected) {
			strip = D.state.runStripEl;
		}
		if (!strip) {
			let prev = el.previousElementSibling;
			while (prev) {
				if (prev.classList?.contains('drox-run-strip')) {
					strip = prev;
					break;
				}
				prev = prev.previousElementSibling;
			}
		}
		if (!strip) {
			return;
		}
		const answer = strip.querySelector('[data-section="answer"]');
		if (answer && el.parentElement !== answer) {
			answer.appendChild(el);
		}
		if (!el.dataset.runStripId && strip.dataset.stripId) {
			el.dataset.runStripId = strip.dataset.stripId;
		}
	};

	fn.parkAllLinearFinalAnswers = function () {
		const orphans = [
			...D.dom.logEl.querySelectorAll(':scope > .msg.assistant.drox-final-answer'),
		];
		for (const el of orphans) {
			fn.parkLinearFinalAnswerElement(el);
		}
		const strips = [...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip')];
		for (const strip of strips) {
			const answer = strip.querySelector('[data-section="answer"]');
			const finals = answer
				? [...answer.querySelectorAll('.msg.assistant.drox-final-answer')]
				: [];
			for (let i = 0; i < finals.length - 1; i++) {
				finals[i].classList.remove('drox-final-answer', 'streaming');
			}
		}
	};

	fn.archivePlanIntoStrip = function (strip) {
		if (!strip) {
			return;
		}
		const answer = strip.querySelector('[data-section="answer"]');
		const ensureArchiveAfterAnswer = (archiveEl) => {
			if (!answer || !archiveEl) {
				return;
			}
			if (archiveEl.previousElementSibling !== answer) {
				answer.insertAdjacentElement('afterend', archiveEl);
			}
		};
		const plan = strip.querySelector('.drox-run-sticky-head [data-section="plan"]');
		if (!plan || plan.childElementCount === 0) {
			const existing = strip.querySelector('.drox-run-plan-archive');
			ensureArchiveAfterAnswer(existing);
			return;
		}
		const verify = fn.ensureRunSection('verify');
		if (verify) {
			for (const tool of [...plan.querySelectorAll('.msg-tool.verify-line')]) {
				verify.appendChild(tool);
			}
		}
		let archive = strip.querySelector('.drox-run-plan-archive');
		if (!archive) {
			archive = document.createElement('div');
			archive.className = 'drox-run-section drox-run-plan-archive';
			archive.dataset.section = 'plan-archive';
			if (answer) {
				answer.insertAdjacentElement('afterend', archive);
			} else {
				strip.appendChild(archive);
			}
		}
		while (plan.firstChild) {
			archive.appendChild(plan.firstChild);
		}
		ensureArchiveAfterAnswer(archive);
	};

	fn.sealRunStrip = function (strip) {
		if (!strip?.isConnected || strip.dataset.sealed === '1') {
			return;
		}
		strip.dataset.sealed = '1';
		strip.classList.add('drox-run-strip-sealed');
		fn.parkAllLinearFinalAnswers();
		const stickyHead = strip.querySelector('.drox-run-sticky-head');
		if (stickyHead) {
			stickyHead.classList.add('drox-run-sticky-head--sealed');
		}
		fn.archivePlanIntoStrip(strip);
		fn.parkAllLinearFinalAnswers();
		fn.compactLinearThinkingSection?.(strip);
	};

	fn.sealAllOpenRunStrips = function () {
		if (!D.dom.logEl) {
			return;
		}
		for (const strip of D.dom.logEl.querySelectorAll(
			':scope > .drox-run-strip:not([data-sealed="1"])',
		)) {
			fn.sealRunStrip(strip);
		}
	};

	fn.beginLinearRunStrip = function () {
		fn.sealAllOpenRunStrips();
		D.state.linearRunUi = true;
		document.body.classList.add('drox-linear-run-active');
		fn.syncStickyStackLayout();
		D.state.runStripEl = null;
		D.state.runStripAnchorEl = null;
		D.state.runStripCommitted = false;
		D.state.planActionRailEl = null;
		D.state.planActionRailSummaryEl = null;
		D.state.planActionRailListEl = null;
		D.state.planActionLineCount = 0;
		D.state.architectActionRailEl = null;
		D.state.architectActionRailSummaryEl = null;
		D.state.architectActionRailListEl = null;
		D.state.architectActionLineCount = 0;
	};

	fn.endLinearRunStrip = function () {
		if (D.state.runStripEl?.isConnected) {
			fn.sealRunStrip(D.state.runStripEl);
		}
		fn.parkAllLinearFinalAnswers();
		D.state.linearRunUi = false;
		D.state.runStripEl = null;
		D.state.runStripAnchorEl = null;
		document.body.classList.remove('drox-linear-run-active');
		fn.syncStickyStackLayout();
	};

	fn.mountRunStripAfter = function (anchorEl) {
		if (!anchorEl?.isConnected) {
			return;
		}
		if (D.state.runStripCommitted) {
			return;
		}
		D.state.runStripAnchorEl = anchorEl;
		const strip = fn.ensureRunStrip();
		if (!strip.isConnected || strip.previousElementSibling !== anchorEl) {
			anchorEl.insertAdjacentElement('afterend', strip);
		}
		fn.scrollLog(true);
	};

	fn.anchorRunStripAfterUser = function (userEl) {
		if (!D.state.linearRunUi || !userEl?.isConnected) {
			return;
		}
		const current = D.state.runStripEl;
		if (current?.isConnected && current.previousElementSibling !== userEl) {
			// Nouveau message user => nouveau cycle. L'ancien strip doit rester dans son
			// contexte (scellé s'il avait du contenu), jamais être recyclé.
			if (current.dataset.sealed !== '1' && (D.state.runStripCommitted || fn.runStripHasContent(current))) {
				fn.sealRunStrip(current);
			} else if (current.dataset.sealed !== '1') {
				current.remove();
			}
			fn.resetLinearRunStripPointers();
		}
		// Met à jour le candidat d'ancrage à chaque message user reçu pendant
		// le run (historique replay + message live). Le strip est déplacé à chaque
		// appel jusqu'à ce que commitRunStripAnchor() le verrouille.
		D.state.runStripAnchorEl = userEl;
		const strip = fn.ensureRunStrip();
		// Repositionne le strip après le dernier user reçu.
		if (strip.previousElementSibling !== userEl) {
			userEl.insertAdjacentElement('afterend', strip);
		}
		fn.reparentTodoBlockToPlan?.();
		fn.syncStickyStackLayout();
		fn.scrollLog(true);
	};

	fn.commitRunStripAnchor = function () {
		// Appelé au premier événement « live » (delta, tool, todoUpdate) pour
		// verrouiller l'ancre définitivement — plus aucun repositionnement ensuite.
		D.state.runStripCommitted = true;
	};

	fn.runStripHasContent = function (strip) {
		if (!strip?.isConnected) {
			return false;
		}
		for (const name of ['plan', 'work', 'thinking', 'verify', 'answer']) {
			const sec = strip.querySelector(`[data-section="${name}"]`);
			if (sec && sec.childElementCount > 0) {
				return true;
			}
		}
		return false;
	};

	fn.resetLinearRunStripPointers = function () {
		D.state.runStripEl = null;
		D.state.runStripCommitted = false;
		D.state.planActionRailEl = null;
		D.state.planActionRailSummaryEl = null;
		D.state.planActionRailListEl = null;
		D.state.planActionLineCount = 0;
		D.state.architectActionRailEl = null;
		D.state.architectActionRailSummaryEl = null;
		D.state.architectActionRailListEl = null;
		D.state.architectActionLineCount = 0;
	};

	fn.ensureRunStrip = function () {
		if (D.state.runStripEl) {
			const strip = D.state.runStripEl;
			if (strip.dataset.sealed === '1') {
				fn.resetLinearRunStripPointers();
				return fn.ensureRunStrip();
			}
			fn.ensureRunStripConnected(strip);
			fn.syncAgentActivityStickyToLinearHead?.();
			fn.syncStickyStackLayout();
			return strip;
		}
		const strip = document.createElement('div');
		strip.className = 'drox-run-strip';
		strip.dataset.stripId = fn.nextRunStripId();
		strip.setAttribute('role', 'log');
		const stickyHead = document.createElement('div');
		stickyHead.className = 'drox-run-sticky-head';
		for (const name of ['banner', 'plan']) {
			const section = document.createElement('div');
			section.className = `drox-run-section drox-run-${name}`;
			section.dataset.section = name;
			stickyHead.appendChild(section);
		}
		strip.appendChild(stickyHead);
		for (const name of ['work', 'thinking', 'verify', 'answer']) {
			const section = document.createElement('div');
			section.className = `drox-run-section drox-run-${name}`;
			section.dataset.section = name;
			if (name === 'verify') {
				section.classList.add('drox-run-verify');
			}
			strip.appendChild(section);
		}
		D.state.runStripEl = strip;
		fn.ensureRunStripConnected(strip);
		fn.touchArchitectRunTailActivity?.();
		fn.syncAgentActivityStickyToLinearHead?.();
		fn.syncStickyStackLayout();
		return strip;
	};

	/** Déplace le bloc Plan dans la section sticky (évite un plan orphelin dans #log). */
	fn.reparentTodoBlockToPlan = function () {
		const block = D.state.currentTodoBlockEl;
		const plan = fn.getRunSection('plan');
		if (!block || !plan || block.parentElement === plan) {
			return;
		}
		const rail = plan.querySelector('.plan-action-rail');
		if (rail) {
			plan.insertBefore(block, rail);
		} else {
			plan.appendChild(block);
		}
	};

	fn.getRunSection = function (name) {
		if (!D.state.linearRunUi) {
			return null;
		}
		const strip = fn.ensureRunStrip();
		return strip.querySelector(`[data-section="${name}"]`);
	};

	/** Rétro-compat : strips créés avant la section `verify`. */
	fn.ensureRunSection = function (name) {
		let sec = fn.getRunSection(name);
		if (sec || name !== 'verify') {
			return sec;
		}
		const strip = D.state.runStripEl;
		const answer = strip?.querySelector('[data-section="answer"]');
		if (!strip || !answer?.parentElement) {
			return null;
		}
		sec = document.createElement('div');
		sec.className = 'drox-run-section drox-run-verify';
		sec.dataset.section = 'verify';
		answer.parentElement.insertBefore(sec, answer);
		return sec;
	};

	fn.getLinearMountParent = function (section) {
		const sec = fn.getRunSection(section);
		return sec || D.dom.logEl;
	};

	fn.ensureLinearThinkingShell = function () {
		if (fn.isExecutorUiContext?.()) {
			return null;
		}
		const section = fn.getRunSection('thinking');
		if (!section) {
			return null;
		}
		let details = section.querySelector('.drox-linear-thinking');
		if (!details) {
			details = document.createElement('details');
			details.className = 'drox-linear-thinking';
			details.open = true;
			const summary = document.createElement('summary');
			summary.textContent = 'Thinking — Architect';
			if (
				typeof fn.ensurePersistentActivityGrid === 'function' &&
				!fn.shouldUseArchitectRunTailActivity?.()
			) {
				fn.ensurePersistentActivityGrid(summary);
			}
			const host = document.createElement('div');
			host.className = 'drox-linear-thinking-host msg assistant markdown drox-explore-reasoning-msg';
			host.dataset.raw = '';
			details.appendChild(summary);
			details.appendChild(host);
			section.appendChild(details);
			fn.bindThinkingScrollEl?.(host);
		} else {
			details.open = true;
		}
		return details.querySelector('.drox-linear-thinking-host');
	};

	fn.compactLinearThinkingSection = function (strip) {
		const root = strip || D.state.runStripEl;
		if (!root) {
			return;
		}
		const section = root.querySelector('[data-section="thinking"]');
		if (!section) {
			return;
		}
		const details = section.querySelector('.drox-linear-thinking');
		const host = section.querySelector('.drox-linear-thinking-host');
		const raw = (host?.dataset?.raw || host?.textContent || '').trim();
		if (!details) {
			return;
		}
		if (!raw) {
			details.remove();
			return;
		}
		details.open = true;
	};

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

	fn.appendLinearThinkingDelta = function (text, executorJobId) {
		if (fn.isExecutorUiContext?.()) {
			fn.appendExecutorThinkingDelta?.(text, false, executorJobId);
			return true;
		}
		const host = fn.ensureLinearThinkingShell();
		if (!host) {
			return false;
		}
		if (!text) {
			return true;
		}
		host.dataset.raw = (host.dataset.raw || '') + text;
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(host, host.dataset.raw);
		} else {
			host.textContent = host.dataset.raw;
		}
		fn.scrollThinkingEl?.(host);
		fn.scrollLog();
		fn.touchArchitectRunTailActivity?.();
		return true;
	};

	fn.tagAssistantWithActiveStrip = function (el) {
		if (!el || !D.state.runStripEl) {
			return;
		}
		if (!D.state.runStripEl.dataset.stripId) {
			D.state.runStripEl.dataset.stripId = fn.nextRunStripId();
		}
		el.dataset.runStripId = D.state.runStripEl.dataset.stripId;
	};

	fn.ensureAssistantInRunAnswer = function () {
		const answer = fn.getRunSection('answer');
		if (!answer || !D.state.assistantEl) {
			return false;
		}
		fn.tagAssistantWithActiveStrip(D.state.assistantEl);
		if (D.state.assistantEl.parentElement !== answer) {
			answer.appendChild(D.state.assistantEl);
		}
		return true;
	};

	const _setBusy = fn.setBusy;
	fn.setBusy = function (next) {
		if (next) {
			fn.beginLinearRunStrip();
		} else {
			fn.hideArchitectRunTailActivity?.();
		}
		if (!next && D.state.linearRunUi) {
			if (D.state.runStripEl?.isConnected) {
				fn.sealRunStrip(D.state.runStripEl);
			}
			fn.parkAllLinearFinalAnswers();
			fn.finalizeRunPresentation?.();
			fn.endLinearRunStrip();
		}
		_setBusy.call(this, next);
	};

	const _renderOrchestrationRole = fn.renderOrchestrationRole;
	fn.renderOrchestrationRole = function (role) {
		const r = String(role || '').trim().toLowerCase();
		D.state.orchestrationRole = r === 'architect' || r === 'executor' ? r : null;
		if (r === 'architect' && D.state.linearRunUi) {
			const banner = fn.getRunSection('banner');
			if (banner && !banner.querySelector('.msg-orchestration-architect')) {
				const el = document.createElement('div');
				el.className = 'msg-orchestration-role msg-orchestration-architect msg-orchestration-architect';
				el.setAttribute('role', 'status');
				el.textContent = 'Architect — planning and delegation';
				banner.appendChild(el);
				fn.scrollLog();
			}
			fn.touchArchitectRunTailActivity?.({ rotatePhrase: true });
			return;
		}
		_renderOrchestrationRole.call(this, role);
	};

	const _mountSubagentCard = fn.mountSubagentCard;
	fn.mountSubagentCard = function (el) {
		const work = fn.getRunSection('work');
		if (work) {
			let grid = work.querySelector('.drox-executor-grid');
			if (!grid) {
				grid = document.createElement('div');
				grid.className = 'drox-executor-grid';
				work.appendChild(grid);
			}
			grid.appendChild(el);
			fn.scrollLog();
			fn.touchArchitectRunTailActivity?.();
			return;
		}
		_mountSubagentCard.call(this, el);
	};

	const _createToolBlock = fn.createToolBlock;
	fn.createToolBlock = function (payload) {
		if (!fn.isExecutorUiContext?.() && D.state.linearRunUi && D.state.orchestrationRole !== 'executor') {
			return fn.createLinearArchitectToolLine(payload);
		}
		return _createToolBlock.call(this, payload);
	};

	const _getLogMountParent = fn.getLogMountParent;
	fn.getLogMountParent = function (jobId) {
		if (fn.isExecutorCaptureActive?.()) {
			const capture = fn.resolveExecutorCapture?.(jobId);
			if (capture?.toolsEl?.isConnected) {
				return capture.toolsEl;
			}
		}
		if (D.state.linearRunUi && D.state.orchestrationRole === 'architect') {
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

	const _openExploreBundle = fn.openExploreBundle;
	fn.openExploreBundle = function () {
		if (D.state.linearRunUi) {
			const thinking = fn.getRunSection('thinking');
			D.state.currentPhaseBodyEl = thinking;
			fn.ensureLinearThinkingShell();
			return thinking;
		}
		return _openExploreBundle.apply(this, arguments);
	};

	const _ensureExploreBundleActive = fn.ensureExploreBundleActive;
	fn.ensureExploreBundleActive = function (phaseHint) {
		if (D.state.linearRunUi && !D.state.exploreBundleEl) {
			if (phaseHint) {
				D.state.currentPhase = phaseHint;
			}
			const thinking = fn.getRunSection('thinking');
			D.state.currentPhaseBodyEl = thinking;
			fn.ensureLinearThinkingShell();
			return thinking;
		}
		return _ensureExploreBundleActive.apply(this, arguments);
	};

	const _appendDeltaExplore = fn.appendDeltaExplore;
	fn.appendDeltaExplore = function (text) {
		if (D.state.linearRunUi && !D.state.exploreBundleEl) {
			if (text) {
				fn.appendLinearThinkingDelta(text);
			}
			return;
		}
		return _appendDeltaExplore.apply(this, arguments);
	};

	const _enterPhase = fn.enterPhase;
	fn.enterPhase = function (phase) {
		if (!D.state.linearRunUi) {
			return _enterPhase.apply(this, arguments);
		}
		if (phase === 'answering' || phase === 'done') {
			return _enterPhase.apply(this, arguments);
		}
		if (
			phase === 'internal_reasoning' ||
			phase === 'reasoning' ||
			phase === 'reading' ||
			phase === 'analyzing' ||
			phase === 'acting' ||
			phase === 'planning' ||
			phase === 'verifying' ||
			phase === 'testing' ||
			phase === 'clarifying'
		) {
			D.state.currentPhase = phase;
			D.state.currentPhaseBodyEl = fn.getRunSection('thinking');
			if (phase === 'internal_reasoning' || phase === 'reasoning') {
				fn.ensureLinearThinkingShell();
			}
			fn.touchArchitectRunTailActivity?.({ rotatePhrase: true });
			return;
		}
		return _enterPhase.apply(this, arguments);
	};

	const _appendDelta = fn.appendDelta;
	fn.appendDelta = function (text, executorJobId) {
		if (!text || !D.state.linearRunUi) {
			_appendDelta.call(this, text, executorJobId);
			return;
		}
		fn.commitRunStripAnchor();
		if (fn.isExecutorUiContext?.()) {
			const answeringMarker = /\[phase:\s*answering\]\s*/i;
			const answerMatch = String(text).match(answeringMarker);
			if (answerMatch && answerMatch.index !== undefined) {
				const before = text.slice(0, answerMatch.index);
				const after = text.slice(answerMatch.index + answerMatch[0].length);
				if (before) {
					fn.appendExecutorThinkingDelta?.(before, false, executorJobId);
				}
				if (after) {
					_appendDelta.call(this, after, executorJobId);
				}
				return;
			}
			fn.appendExecutorThinkingDelta?.(text, false, executorJobId);
			return;
		}
		const answeringMarker = /\[phase:\s*answering\]\s*/i;
		const answerMatch = String(text).match(answeringMarker);
		if (answerMatch && answerMatch.index !== undefined) {
			const before = text.slice(0, answerMatch.index);
			const after = text.slice(answerMatch.index + answerMatch[0].length);
			if (before) {
				fn.appendLinearThinkingDelta(before);
			}
			_appendDelta.call(this, after || '');
			return;
		}
		if (D.state.answerStreamOnLog || D.state.currentPhase === 'answering') {
			_appendDelta.call(this, text);
			return;
		}
		if (fn.isModelThinkingMonologue?.(text)) {
			fn.appendLinearThinkingDelta(text);
			return;
		}
		fn.appendLinearThinkingDelta(text);
		fn.touchArchitectRunTailActivity?.();
	};

	const _appendDeltaToAnswerLog = fn.appendDeltaToAnswerLog;
	fn.appendDeltaToAnswerLog = function (text) {
		if (!text) {
			return;
		}
		if (D.state.linearRunUi) {
			if (fn.isModelThinkingMonologue?.(text)) {
				fn.appendLinearThinkingDelta(text);
				return;
			}
			const answer = fn.getRunSection('answer');
			if (answer) {
				if (
					!D.state.assistantEl ||
					(D.state.assistantEl.parentElement !== answer &&
						D.state.assistantEl.parentElement !== D.dom.logEl)
				) {
					D.state.assistantEl = document.createElement('div');
					D.state.assistantEl.className = 'msg assistant msg-ai-frame streaming markdown';
					D.state.assistantEl.dataset.raw = '';
					fn.markFinalAnswerElement?.(D.state.assistantEl);
					fn.tagAssistantWithActiveStrip(D.state.assistantEl);
					answer.appendChild(D.state.assistantEl);
				} else if (D.state.assistantEl.parentElement === D.dom.logEl) {
					fn.tagAssistantWithActiveStrip(D.state.assistantEl);
					answer.appendChild(D.state.assistantEl);
				}
				D.state.assistantEl.dataset.raw = (D.state.assistantEl.dataset.raw || '') + text;
				fn.setAssistantMarkdown(D.state.assistantEl, D.state.assistantEl.dataset.raw);
				fn.markFinalAnswerElement?.(D.state.assistantEl);
				if (D.state.busy) {
					fn.showActivityBeforeNode?.(D.state.assistantEl);
				}
				fn.scrollLog();
				fn.touchArchitectRunTailActivity?.();
				return;
			}
		}
		_appendDeltaToAnswerLog.call(this, text);
	};

	const _beginAnsweringStream = fn.beginAnsweringStream;
	fn.beginAnsweringStream = function (initialAnswerText) {
		_beginAnsweringStream.call(this, initialAnswerText);
		if (!D.state.linearRunUi || !D.state.assistantEl) {
			return;
		}
		fn.ensureAssistantInRunAnswer();
		fn.markFinalAnswerElement?.(D.state.assistantEl);
		fn.scrollLog(true);
	};

	const _finalizeRunPresentation = fn.finalizeRunPresentation;
	fn.finalizeRunPresentation = function () {
		if (D.state.linearRunUi || fn.hasLinearRunStripsOnLog()) {
			fn.parkAllLinearFinalAnswers();
			if (D.state.runStripEl?.isConnected) {
				fn.parkLinearFinalAnswerElement(D.state.assistantEl);
			}
		}
		_finalizeRunPresentation?.call(this);
	};

	const _hasLinearRunLayout = function () {
		return Boolean(
			D.state.linearRunUi ||
			(typeof fn.hasLinearRunStripsOnLog === 'function' && fn.hasLinearRunStripsOnLog()),
		);
	};

	const _promoteExploreAssistantsToAnswer = fn.promoteExploreAssistantsToAnswer;
	fn.promoteExploreAssistantsToAnswer = function () {
		if (_hasLinearRunLayout()) {
			return;
		}
		_promoteExploreAssistantsToAnswer.call(this);
	};

	const _promoteLastExploreReflectionToAnswer = fn.promoteLastExploreReflectionToAnswer;
	fn.promoteLastExploreReflectionToAnswer = function () {
		if (_hasLinearRunLayout()) {
			return;
		}
		_promoteLastExploreReflectionToAnswer.call(this);
	};

	const _splitAndPromoteUserFacingFromExplore = fn.splitAndPromoteUserFacingFromExplore;
	fn.splitAndPromoteUserFacingFromExplore = function () {
		if (_hasLinearRunLayout()) {
			return;
		}
		_splitAndPromoteUserFacingFromExplore.call(this);
	};

	/** « N agent(s) actif(s) » dans le sticky plan (évite le gap chrome / fil). */
	fn.syncAgentActivityStickyToLinearHead = function () {
		const chrome = D.dom.agentActivityStickyEl;
		if (!chrome || !_hasLinearRunLayout()) {
			const orphan = document.querySelector('.drox-agent-activity-inline');
			orphan?.remove();
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
