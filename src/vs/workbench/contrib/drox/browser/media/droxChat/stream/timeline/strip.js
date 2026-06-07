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
		// performSend + host `busy:true` — ne pas réinitialiser l'ancre du 1er tour.
		if (D.state.linearRunUi && D.state.busy) {
			return;
		}
		fn.sealAllOpenRunStrips();
		D.state.discussionRunActive = false;
		D.state.discussionAwaitingCanonicalReply = false;
		fn.resetChatStreamForTurn?.();
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
			// Nouveau message user => nouveau cycle. L'ancien strip reste sous le user précédent.
			const hasAnswer = Boolean(
				current.querySelector(
					'[data-section="answer"] .drox-final-answer, [data-section="answer"] .drox-user-facing-reply, [data-section="answer"] .drox-chat-stream',
				),
			);
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
		fn.pruneOrphanThinkingAssistants?.();
		fn.flushGateThinkingBufferToHost?.();
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
		if (D.dom.logEl) {
			const open = [
				...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip:not([data-sealed="1"])'),
			];
			const adopted = open.length > 0 ? open[open.length - 1] : null;
			if (adopted) {
				D.state.runStripEl = adopted;
				fn.ensureRunStripConnected(adopted);
				fn.syncAgentActivityStickyToLinearHead?.();
				fn.syncStickyStackLayout();
				return adopted;
			}
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

})(globalThis.DroxChat);
