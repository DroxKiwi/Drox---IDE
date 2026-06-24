/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil lineaire append-only : plan, work, thinking, answer (pas de promotion Exploring).

(function (D) {
	const fn = D.fn;

	/** Hauteur cumulée des bandeaux chrome (onglets + objectif) pour la pile sticky du fil. */
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
		if (!strip) {
			return;
		}
		const anchor = D.state.runStripAnchorEl;
		if (anchor?.isConnected) {
			if (strip.previousElementSibling !== anchor) {
				anchor.insertAdjacentElement('afterend', strip);
			}
			return;
		}
		if (strip.isConnected) {
			return;
		}
		const users = fn.queryUserMessageRows?.(D.dom.logEl) ?? [
			...D.dom.logEl.querySelectorAll(':scope > .msg-row-user'),
		];
		const lastUser = users?.length ? users[users.length - 1] : null;
		if (lastUser?.isConnected) {
			const anchor = fn.resolveUserMessageAnchor?.(lastUser) ?? lastUser;
			anchor.insertAdjacentElement('afterend', strip);
			D.state.runStripAnchorEl = anchor;
			return;
		}
		D.dom.logEl?.appendChild(strip);
	};

	fn.pruneExtraOpenRunStrips = function (keepStrip) {
		if (!D.dom.logEl) {
			return;
		}
		for (const strip of D.dom.logEl.querySelectorAll(
			':scope > .drox-run-strip:not([data-sealed="1"])',
		)) {
			if (strip === keepStrip) {
				continue;
			}
			if (fn.runStripHasContent(strip)) {
				fn.sealRunStrip(strip);
			} else {
				strip.remove();
			}
		}
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
		if (
			!el?.classList?.contains('drox-final-answer') &&
			!el?.classList?.contains('drox-user-facing-reply')
		) {
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
		const planBlock =
			D.dom.planStickyFooterEl?.querySelector('.msg-todos') ||
			strip.querySelector(':scope > .drox-run-plan-slot .msg-todos') ||
			strip.querySelector('.drox-run-chronology .msg-todos');
		if (!planBlock) {
			const existing = strip.querySelector('.drox-run-plan-archive');
			ensureArchiveAfterAnswer(existing);
			return;
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
		archive.appendChild(planBlock);
		ensureArchiveAfterAnswer(archive);
		if (
			D.state.currentTodoBlockEl === planBlock &&
			strip.dataset.sealed === '1' &&
			strip !== D.state.runStripEl
		) {
			D.state.currentTodoBlockEl = null;
		}
		fn.syncPlanStickyFooter?.();
	};

	const WORK_STATS_REASONING_PHASES = new Set([
		'internal_reasoning',
		'reasoning',
		'reading',
		'analyzing',
		'planning',
		'clarifying',
	]);

	fn.ensureRunWorkOpen = function (strip) {
		strip = strip || D.state.runStripEl;
		if (!strip?.isConnected) {
			return;
		}
		const work = strip.querySelector('details.drox-run-work-collapsible');
		if (work) {
			work.open = true;
		}
	};

	fn.syncWorkSummaryStats = function (strip) {
		strip = strip || D.state.runStripEl;
		if (!strip?.isConnected) {
			return;
		}
		const summary = strip.querySelector('.drox-run-work-summary');
		const chronology = fn.ensureChronologySection(strip);
		if (!summary || !chronology) {
			return;
		}
		let reasoning = 0;
		let acting = 0;
		for (const block of chronology.querySelectorAll('.phase-block')) {
			const phase = block.dataset.phase || '';
			if (WORK_STATS_REASONING_PHASES.has(phase)) {
				reasoning += 1;
			} else if (phase === 'acting') {
				acting += 1;
			}
		}
		const shellCount = chronology.querySelectorAll('.drox-shell-card').length;
		const genericTools = chronology.querySelectorAll('.msg-tool:not(.drox-shell-card)').length;
		const fileChanges = strip.querySelectorAll('.msg-file-change').length;
		const parts = [];
		if (reasoning > 0) {
			parts.push(`${reasoning} reasoning`);
		}
		if (acting > 0) {
			parts.push(`${acting} acting`);
		}
		if (shellCount > 0) {
			parts.push(`${shellCount} shell`);
		}
		if (genericTools > 0) {
			parts.push(`${genericTools} tool`);
		}
		if (fileChanges > 0) {
			parts.push(`${fileChanges} edit`);
		}
		summary.textContent = parts.length > 0 ? `Work · ${parts.join(' · ')}` : 'Work';
	};

	fn.resetPlanStateForTurn = function () {
		D.state.currentTodoBlockEl = null;
		D.state.todoSnapshot = [];
		fn.syncPlanStickyFooter?.();
	};

	fn.shouldMountPlanInStickyFooter = function (strip) {
		if (!D.dom.planStickyFooterEl || !D.state.linearRunUi) {
			return false;
		}
		strip = strip || D.state.runStripEl;
		if (strip && strip.dataset.sealed === '1') {
			return false;
		}
		return true;
	};

	fn.syncPlanStickyFooter = function () {
		const footer = D.dom.planStickyFooterEl;
		if (!footer) {
			return;
		}
		const hasPlan = Boolean(footer.querySelector('.msg-todos'));
		footer.hidden = !hasPlan;
	};

	fn.ensurePlanMount = function (strip) {
		strip = strip || D.state.runStripEl;
		if (fn.shouldMountPlanInStickyFooter(strip)) {
			return D.dom.planStickyFooterEl;
		}
		if (!strip) {
			return null;
		}
		let slot = strip.querySelector(':scope > .drox-run-plan-slot');
		if (!slot) {
			slot = document.createElement('div');
			slot.className = 'drox-run-plan-slot drox-run-section';
			slot.dataset.section = 'plan';
			const work = strip.querySelector('details.drox-run-work-collapsible');
			if (work) {
				strip.insertBefore(slot, work);
			} else {
				strip.prepend(slot);
			}
		}
		return slot;
	};

	fn.isUserMessageRow = function (el) {
		return Boolean(
			el?.classList?.contains('msg-row-user') ||
				el?.classList?.contains('msg-user-bubble') ||
				el?.classList?.contains('msg-user-block'),
		);
	};

	fn.sealRunStrip = function (strip) {
		if (!strip?.isConnected || strip.dataset.sealed === '1') {
			return;
		}
		if (D.state.streamPhaseBlockEl && strip.contains(D.state.streamPhaseBlockEl)) {
			fn.resetStreamChronology?.();
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
		fn.clearAllActivityGrids?.(strip);
		fn.syncWorkSummaryStats?.(strip);
		fn.collapseRunWorkSection?.(strip, { keepOpen: false });
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
		// performSend + host `busy:true` — ne pas réinitialiser l'ancre du 1er tour.
		if (D.state.linearRunUi && D.state.busy) {
			return;
		}
		fn.sealAllOpenRunStrips();
		D.state.discussionRunActive = false;
		D.state.discussionAwaitingCanonicalReply = false;
		fn.resetChatStreamForTurn?.();
		fn.resetStreamChronology?.();
		fn.resetPlanStateForTurn?.();
		D.state.linearRunUi = true;
		document.body.classList.add('drox-linear-run-active');
		fn.syncStickyStackLayout();
		D.state.runStripEl = null;
		D.state.runStripAnchorEl = null;
		D.state.runStripCommitted = false;
		D.state.assistantEl = null;
	};

	fn.endLinearRunStrip = function () {
		if (
			typeof fn.shouldPreserveDiscussionStripOnBusyEnd === 'function' &&
			fn.shouldPreserveDiscussionStripOnBusyEnd()
		) {
			return;
		}
		if (D.state.runStripEl?.isConnected) {
			fn.sealRunStrip(D.state.runStripEl);
		}
		fn.parkAllLinearFinalAnswers();
		D.state.linearRunUi = false;
		D.state.runStripEl = null;
		D.state.runStripAnchorEl = null;
		fn.resetChatStreamForTurn?.();
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
		const anchor = fn.resolveUserMessageAnchor?.(anchorEl) ?? anchorEl;
		D.state.runStripAnchorEl = anchor;
		const strip = fn.ensureRunStrip();
		if (!strip.isConnected || strip.previousElementSibling !== anchor) {
			anchor.insertAdjacentElement('afterend', strip);
		}
		fn.scrollLog(true);
	};

	fn.anchorRunStripAfterUser = function (userEl) {
		if (!D.state.linearRunUi || !userEl?.isConnected) {
			return;
		}
		const userAnchor = fn.resolveUserMessageAnchor?.(userEl) ?? userEl;
		const current = D.state.runStripEl;
		if (current?.isConnected && current.previousElementSibling !== userAnchor) {
			// Nouveau message user => nouveau cycle. L'ancien strip reste sous le user précédent.
			const hasAnswer = Boolean(
				current.querySelector(
					'[data-section="answer"] .drox-final-answer, [data-section="answer"] .drox-user-facing-reply, [data-section="answer"] .drox-chat-stream',
				),
			);
			const prevIsUser = fn.isUserMessageRow(current.previousElementSibling);
			// Les events tool/delta peuvent créer le strip avant l'écho user — repositionner, pas sceller.
			if (
				current.dataset.sealed !== '1' &&
				D.state.busy &&
				!hasAnswer &&
				!D.state.runStripCommitted &&
				fn.runStripHasContent(current) &&
				!prevIsUser
			) {
				userAnchor.insertAdjacentElement('afterend', current);
				D.state.runStripEl = current;
				D.state.runStripAnchorEl = userAnchor;
				const work = current.querySelector('details.drox-run-work-collapsible');
				if (work) {
					work.open = true;
				}
				fn.reparentTodoBlockToPlan?.();
				fn.syncWorkSummaryStats?.(current);
				fn.syncStickyStackLayout();
				fn.scrollLog(true);
				return;
			}
			if (
				current.dataset.sealed !== '1' &&
				(hasAnswer || D.state.runStripCommitted || fn.runStripHasContent(current))
			) {
				fn.sealRunStrip(current);
				fn.parkAllLinearFinalAnswers?.();
			} else if (current.dataset.sealed !== '1') {
				current.remove();
			}
			fn.resetLinearRunStripPointers();
			fn.resetChatStreamForTurn?.();
			fn.resetPlanStateForTurn?.();
			fn.resetStreamChronology?.();
		}
		// Met à jour le candidat d'ancrage à chaque message user reçu pendant
		// le run (historique replay + message live). Le strip est déplacé à chaque
		// appel jusqu'à ce que commitRunStripAnchor() le verrouille.
		D.state.runStripAnchorEl = userAnchor;
		const strip = fn.ensureRunStrip();
		// Repositionne le strip après le dernier user reçu.
		if (strip.previousElementSibling !== userAnchor) {
			userAnchor.insertAdjacentElement('afterend', strip);
		}
		const work = strip.querySelector('details.drox-run-work-collapsible');
		if (work && D.state.busy) {
			work.open = true;
		}
		fn.reparentTodoBlockToPlan?.();
		fn.syncWorkSummaryStats?.(strip);
		fn.syncStickyStackLayout();
		fn.scrollLog(true);
	};

	fn.commitRunStripAnchor = function () {
		// Appelé au premier événement « live » (delta, tool, todoUpdate) pour
		// verrouiller l'ancre définitivement — plus aucun repositionnement ensuite.
		D.state.runStripCommitted = true;
		fn.pruneOrphanThinkingAssistants?.();
		fn.flushGateThinkingBufferToHost?.();
	};

	fn.runStripHasContent = function (strip) {
		if (!strip?.isConnected) {
			return false;
		}
		for (const name of ['chronology', 'answer']) {
			const sec = strip.querySelector(`[data-section="${name}"]`);
			if (sec && sec.childElementCount > 0) {
				return true;
			}
		}
		const planSlot = strip.querySelector(':scope > .drox-run-plan-slot');
		if (planSlot?.querySelector('.msg-todos')) {
			return true;
		}
		// Strips legacy pré-1.5.1
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
	};

	fn.ensureRunStrip = function () {
		if (D.state.runStripEl) {
			const strip = D.state.runStripEl;
			if (strip.dataset.sealed === '1') {
				fn.resetLinearRunStripPointers();
				return fn.ensureRunStrip();
			}
			fn.ensureRunStripConnected(strip);
			fn.syncStickyStackLayout();
			return strip;
		}
		if (D.dom.logEl) {
			const open = [
				...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip:not([data-sealed="1"])'),
			];
			const adopted = open.length > 0 ? open[open.length - 1] : null;
			if (adopted) {
				D.state.runStripEl = adopted;
				fn.pruneExtraOpenRunStrips(adopted);
				fn.ensureRunStripConnected(adopted);
				fn.syncStickyStackLayout();
				return adopted;
			}
		}
		fn.pruneExtraOpenRunStrips(null);
		const strip = document.createElement('div');
		strip.className = 'drox-run-strip';
		strip.dataset.stripId = fn.nextRunStripId();
		strip.setAttribute('role', 'log');
		const planSlot = document.createElement('div');
		planSlot.className = 'drox-run-plan-slot drox-run-section';
		planSlot.dataset.section = 'plan';
		strip.appendChild(planSlot);
		const work = document.createElement('details');
		work.className = 'drox-run-work-collapsible drox-run-section';
		work.open = true;
		const workSummary = document.createElement('summary');
		workSummary.className = 'drox-run-work-summary';
		workSummary.textContent = 'Work';
		work.appendChild(workSummary);
		const chronology = document.createElement('div');
		chronology.className = 'drox-run-section drox-run-chronology';
		chronology.dataset.section = 'chronology';
		work.appendChild(chronology);
		strip.appendChild(work);
		const answer = document.createElement('div');
		answer.className = 'drox-run-section drox-run-answer';
		answer.dataset.section = 'answer';
		strip.appendChild(answer);
		D.state.runStripEl = strip;
		fn.pruneExtraOpenRunStrips(strip);
		fn.ensureRunStripConnected(strip);
		fn.touchArchitectRunTailActivity?.();
		fn.syncStickyStackLayout();
		return strip;
	};

	/** Déplace le bloc Plan dans l'emplacement dédié (hors panneau WORK repliable). */
	fn.reparentTodoBlockToPlan = function () {
		const block = D.state.currentTodoBlockEl;
		if (!block?.isConnected) {
			return;
		}
		const ownerStrip = block.closest('.drox-run-strip');
		if (ownerStrip?.dataset?.sealed === '1') {
			return;
		}
		const strip = D.state.runStripEl || ownerStrip;
		if (ownerStrip && strip && ownerStrip !== strip) {
			return;
		}
		const mount = fn.ensurePlanMount(strip);
		if (!mount || block.parentElement === mount) {
			fn.syncPlanStickyFooter?.();
			return;
		}
		mount.appendChild(block);
		fn.syncPlanStickyFooter?.();
	};

	fn.getRunSection = function (name) {
		if (!D.state.linearRunUi) {
			return null;
		}
		const strip = fn.ensureRunStrip();
		if (name === 'plan') {
			return fn.ensurePlanMount(strip);
		}
		const direct = strip.querySelector(`[data-section="${name}"]`);
		if (direct) {
			return direct;
		}
		if (name === 'thinking' || name === 'work' || name === 'verify' || name === 'plan') {
			return fn.ensureChronologySection(strip);
		}
		return null;
	};

	/** Rétro-compat : strips créés avant la section `verify`. */
	fn.ensureRunSection = function (name) {
		let sec = fn.getRunSection(name);
		if (sec || name !== 'verify') {
			return sec;
		}
		return fn.ensureChronologySection(D.state.runStripEl);
	};

	fn.getLinearMountParent = function (section) {
		const sec = fn.getRunSection(section);
		return sec || D.dom.logEl;
	};

})(globalThis.DroxChat);
