/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Affichage messages — contrat : drox-engine/docs/1.3/1.3.2/PROTOCOL-CONTRACT.md §3
// Thinking interne → panneau Thinking ; reste → chat ; userFacingReply → chat canonique.

(function (D) {
	const fn = D.fn;
	const THINKING_PHASES = new Set(['internal_reasoning', 'reasoning']);

	fn.looksLikeGateJson = function (text) {
		const t = String(text || '').trim();
		if (!t.startsWith('{')) {
			return /\{\s*"(?:gate|open)"\s*:/i.test(t);
		}
		try {
			const o = JSON.parse(t);
			return Boolean(o && typeof o === 'object' && ('gate' in o || 'open' in o));
		} catch {
			return /^\s*\{\s*"(?:gate|open)"\s*:/i.test(t);
		}
	};

	fn.stripProtocolMarkers = function (text) {
		return String(text || '')
			.replace(/\[discussion:\s*reply\]\s*/gi, '')
			.replace(/\[discussion:\s*done\]\s*/gi, '')
			.replace(/\[phase:\s*(?:answering|done)\]\s*/gi, '')
			.replace(/\{[^{}]*"(?:gate|open)"\s*:\s*[^}]+\}/gi, '');
	};

	fn.sanitizeChatText = function (text) {
		return fn.stripProtocolMarkers(text).trim();
	};

	/** Morceau stream — conserve les espaces inter-chunks (markdown / phrases). */
	fn.sanitizeChatDeltaChunk = function (text) {
		const stripped = fn.stripProtocolMarkers(text);
		return stripped.trim().length > 0 ? stripped : '';
	};

	fn.isDiscussionRunActive = function () {
		return Boolean(D.state.discussionRunActive);
	};

	fn.deltaBelongsInThinking = function (text) {
		if (fn.looksLikeGateJson(text)) {
			return true;
		}
		if (THINKING_PHASES.has(D.state.currentPhase)) {
			return true;
		}
		if (fn.isDiscussionRunActive()) {
			return false;
		}
		return false;
	};

	fn.hasDiscussionAnswerInStrip = function () {
		if (!D.dom.logEl) {
			return false;
		}
		const strips = [...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip:not([data-sealed="1"])')];
		for (let i = strips.length - 1; i >= 0; i--) {
			const answer = strips[i].querySelector('[data-section="answer"]');
			if (
				answer?.querySelector(
					':scope > .drox-user-facing-reply, :scope > .drox-chat-stream, :scope > .msg.drox-chat-stream',
				)
			) {
				return true;
			}
		}
		return false;
	};

	fn.shouldPreserveDiscussionStripOnBusyEnd = function () {
		if (fn.hasDiscussionAnswerInStrip()) {
			return true;
		}
		return Boolean(D.state.discussionRunActive || D.state.discussionAwaitingCanonicalReply);
	};

	/** Début run `architect_discussion` — repartir d'un routage answer propre. */
	fn.beginDiscussionRunPresentation = function () {
		D.state.discussionRunActive = true;
		D.state.discussionAwaitingCanonicalReply = true;
		D.state.currentPhase = null;
		D.state.currentPhaseEl = null;
		D.state.currentPhaseBodyEl = null;
		fn.resetChatStreamForTurn?.();
	};

	fn.finishDiscussionRunPresentation = function () {
		D.state.discussionRunActive = false;
		D.state.discussionAwaitingCanonicalReply = false;
	};

	fn.resetChatStreamForTurn = function () {
		D.state.chatStreamEl = null;
		D.state.chatStreamStripId = '';
	};

	fn.getChatAnswerSection = function () {
		if (D.state.linearRunUi && typeof fn.getRunSection === 'function') {
			const sec = fn.getRunSection('answer');
			if (sec) {
				return sec;
			}
		}
		return D.dom.logEl;
	};

	/** Strip du tour sans pastille « réponse utilisateur » (réponse tardive). */
	fn.findStripAwaitingUserReply = function () {
		if (!D.dom.logEl) {
			return D.state.runStripEl;
		}
		const strips = [...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip')];
		for (let i = strips.length - 1; i >= 0; i--) {
			const strip = strips[i];
			if (!strip.querySelector('.drox-user-facing-reply')) {
				return strip;
			}
		}
		return D.state.runStripEl;
	};

	fn.resolveUserReplyMount = function () {
		if (!D.state.linearRunUi) {
			return D.dom.logEl;
		}
		const strip = fn.findStripAwaitingUserReply?.();
		if (strip) {
			if (typeof fn.ensureRunStripConnected === 'function') {
				fn.ensureRunStripConnected(strip);
			}
			D.state.runStripEl = strip;
			if (strip.isConnected) {
				const answer = strip.querySelector('[data-section="answer"]');
				if (answer) {
					return answer;
				}
				return strip;
			}
		}
		const fallback = fn.getChatAnswerSection();
		if (fallback) {
			return fallback;
		}
		return D.dom.logEl;
	};

	fn.appendThinkingDelta = function (text) {
		if (!text) {
			return;
		}
		if (D.state.linearRunUi && typeof fn.appendStreamBufferDelta === 'function') {
			fn.appendStreamBufferDelta(text);
			return;
		}
		fn.appendLinearThinkingDelta?.(text);
	};

	/** Rendu markdown assistant (titres, listes, code, gras…) — réponses finales. */
	fn.paintAssistantMarkdown = function (el, raw, opts) {
		if (!el) {
			return;
		}
		const options = opts || {};
		el.classList.add('msg', 'assistant', 'msg-ai-frame', 'markdown');
		if (options.streaming) {
			el.classList.add('streaming');
		} else {
			el.classList.remove('streaming');
		}
		const text = String(raw ?? '');
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(el, text);
			return;
		}
		el.dataset.raw = text;
		while (el.firstChild) {
			el.removeChild(el.firstChild);
		}
		el.textContent = text;
	};

	fn.ensureChatStreamElement = function (parent) {
		const stripId = D.state.runStripEl?.dataset?.stripId || '';
		if (
			D.state.chatStreamEl?.isConnected &&
			D.state.chatStreamStripId === stripId &&
			D.state.chatStreamEl.parentElement === parent
		) {
			return D.state.chatStreamEl;
		}
		const el = document.createElement('div');
		el.className = 'msg assistant msg-ai-frame markdown drox-chat-stream streaming';
		el.dataset.raw = '';
		if (stripId) {
			el.dataset.runStripId = stripId;
		}
		D.state.chatStreamEl = el;
		D.state.chatStreamStripId = stripId;
		if (parent === D.dom.logEl) {
			fn.appendToLog?.(el);
		} else {
			parent.appendChild(el);
		}
		return el;
	};

	fn.appendChatDelta = function (text) {
		const chunk = fn.sanitizeChatDeltaChunk(text);
		if (!chunk) {
			return;
		}
		if (D.state.linearRunUi && D.state.currentPhase !== 'answering') {
			fn.appendThinkingDelta(chunk);
			return;
		}
		const parent = fn.getChatAnswerSection();
		if (!parent) {
			return;
		}
		if (typeof fn.ensureRunStripConnected === 'function' && D.state.runStripEl) {
			fn.ensureRunStripConnected(D.state.runStripEl);
		}
		const el = fn.ensureChatStreamElement(parent);
		const nextRaw = (el.dataset.raw || '') + chunk;
		fn.paintAssistantMarkdown(el, nextRaw, { streaming: true });
		if (D.state.busy && typeof fn.ensureTailWarmupActivity === 'function') {
			fn.ensureTailWarmupActivity();
		}
		fn.scrollLog?.();
	};

	/** Stream answer sans événement `userFacingReply` → réponse finale visible. */
	fn.promoteChatStreamToFinalAnswer = function () {
		if (!D.dom.logEl) {
			return;
		}
		const strips = [
			...D.dom.logEl.querySelectorAll(':scope > .drox-run-strip:not([data-sealed="1"])'),
		];
		if (strips.length === 0 && D.state.runStripEl?.isConnected) {
			strips.push(D.state.runStripEl);
		}
		for (const strip of strips) {
			const answer = strip.querySelector('[data-section="answer"]');
			if (!answer) {
				continue;
			}
			const stream = answer.querySelector(
				':scope > .drox-chat-stream, :scope > .msg.drox-chat-stream',
			);
			if (!stream || stream.classList.contains('drox-user-facing-reply')) {
				continue;
			}
			const text =
				String(stream.dataset?.raw ?? '').trim() ||
				String(stream.textContent ?? '').trim();
			if (!text) {
				continue;
			}
			stream.classList.remove('drox-chat-stream', 'streaming');
			stream.classList.add('drox-user-facing-reply', 'drox-final-answer');
			fn.paintAssistantMarkdown(stream, text, { streaming: false });
			D.state.discussionAwaitingCanonicalReply = false;
			D.state.discussionRunActive = false;
		}
		fn.resetChatStreamForTurn();
	};

	/** Ligne seule `[phase: answering]` / `[phase: done]` (pas une citation dans le thinking). */
	fn.isStandalonePhaseLine = function (line, phaseName) {
		return new RegExp(`^\\s*\\[phase:\\s*${phaseName}\\]\\s*$`, 'i').test(String(line || ''));
	};

	/** Garde-fou : texte après le dernier marqueur phase `answering` sur sa propre ligne. */
	fn.extractAnsweringOnlyText = function (text) {
		const raw = String(text || '');
		const lines = raw.split('\n');
		let lastAnsweringIdx = -1;
		for (let i = 0; i < lines.length; i++) {
			if (fn.isStandalonePhaseLine(lines[i], 'answering')) {
				lastAnsweringIdx = i;
			}
		}
		if (lastAnsweringIdx >= 0) {
			let body = lines.slice(lastAnsweringIdx + 1);
			const doneIdx = body.findIndex((line) => fn.isStandalonePhaseLine(line, 'done'));
			if (doneIdx >= 0) {
				body = body.slice(0, doneIdx);
			}
			return fn.sanitizeChatText(body.join('\n'));
		}
		return fn.sanitizeChatText(raw);
	};

	/** Le stream UI est plus complet que le `userFacingReply` moteur (extract tronqué). */
	fn.shouldPreferStreamOverCanonicalReply = function (existingText, reply) {
		const existing = String(existingText || '').trim();
		const canon = String(reply || '').trim();
		if (!existing || !canon) {
			return false;
		}
		if (fn.isBrokenCanonicalReply(canon)) {
			return existing.length > canon.length;
		}
		if (existing.length > canon.length && existing.includes(canon)) {
			return true;
		}
		if (canon.length < existing.length * 0.6) {
			return true;
		}
		return false;
	};

	/** Réponse canonique manifestement corrompue (fragments de thinking / backticks). */
	fn.isBrokenCanonicalReply = function (text) {
		const t = String(text || '').trim();
		if (!t) {
			return true;
		}
		if (t.length < 8 && /[`'"]/.test(t)) {
			return true;
		}
		if (/^\d+\.\s+Then\s*`?$/i.test(t)) {
			return true;
		}
		return false;
	};

	/** Réponse directe utilisateur dans le chat du bon tour. */
	fn.applyUserFacingReply = function (text) {
		const reply = fn.extractAnsweringOnlyText(text);
		if (!reply || fn.looksLikeGateJson(reply)) {
			return;
		}
		const mount = fn.resolveUserReplyMount();
		const existingStream = mount?.querySelector(
			':scope > .drox-chat-stream, :scope > .msg.drox-chat-stream',
		);
		const existingText = String(existingStream?.dataset?.raw ?? existingStream?.textContent ?? '').trim();
		if (fn.shouldPreferStreamOverCanonicalReply(existingText, reply)) {
			fn.promoteChatStreamToFinalAnswer?.();
			return;
		}
		const parent = fn.resolveUserReplyMount();
		if (!parent) {
			return;
		}
		const streams = [
			...new Set([
				...parent.querySelectorAll(':scope > .drox-chat-stream'),
				...parent.querySelectorAll(':scope > .msg.assistant.drox-chat-stream'),
			]),
		];
		let el = streams[0] || null;
		if (el) {
			el.classList.remove('drox-chat-stream', 'streaming');
			el.classList.add('drox-user-facing-reply', 'drox-final-answer');
			for (let i = 1; i < streams.length; i++) {
				if (streams[i] !== el) {
					streams[i].remove();
				}
			}
		} else {
			const existing = parent.querySelector(':scope > .drox-user-facing-reply');
			if (existing) {
				el = existing;
			} else {
				el = document.createElement('div');
				el.className =
					'msg assistant msg-ai-frame markdown drox-user-facing-reply drox-final-answer';
				parent.appendChild(el);
			}
		}
		const stripId = D.state.runStripEl?.dataset?.stripId || '';
		if (stripId) {
			el.dataset.runStripId = stripId;
		}
		fn.paintAssistantMarkdown(el, reply, { streaming: false });
		fn.resetChatStreamForTurn();
		D.state.discussionAwaitingCanonicalReply = false;
		D.state.discussionRunActive = false;
		fn.markTurnFinalAssistant?.(el);
		if (typeof fn.finalizeAssistant === 'function') {
			fn.finalizeAssistant();
		}
		const strip = D.state.runStripEl;
		if (strip?.isConnected && typeof fn.sealRunStrip === 'function' && strip.dataset.sealed !== '1') {
			fn.sealRunStrip(strip);
		}
		fn.scrollLog?.();
	};

	fn.scheduleGateThinkingDelta = function (text) {
		fn.appendThinkingDelta(text);
	};

	fn.pruneOrphanThinkingAssistants = function () {
		const section = typeof fn.getRunSection === 'function' ? fn.getRunSection('thinking') : null;
		if (!section) {
			return;
		}
		for (const el of section.querySelectorAll(':scope > .msg.assistant')) {
			el.remove();
		}
	};

	fn.routeSimpleDisplayDelta = function (text, _executorJobId) {
		if (!text) {
			return true;
		}
		const discussionDone = /\[discussion:\s*done\]\s*/i;
		const doneMatch = String(text).match(discussionDone);
		if (doneMatch && doneMatch.index !== undefined) {
			const before = text.slice(0, doneMatch.index);
			const after = text.slice(doneMatch.index + doneMatch[0].length);
			if (before) {
				fn.routeSimpleDisplayDelta(before, _executorJobId);
			}
			if (after.trim()) {
				fn.routeSimpleDisplayDelta(after, _executorJobId);
			}
			return true;
		}
		if (typeof fn.commitRunStripAnchor === 'function') {
			fn.commitRunStripAnchor();
		}
		// Fil linéaire : tout hors `answering` reste dans la chronologie (Travail).
		if (D.state.linearRunUi && D.state.currentPhase !== 'answering') {
			fn.appendThinkingDelta(text);
			return true;
		}
		const answeringMarker = /\[phase:\s*answering\]\s*/i;
		const answerMatch = String(text).match(answeringMarker);
		if (answerMatch && answerMatch.index !== undefined) {
			const before = text.slice(0, answerMatch.index);
			const after = text.slice(answerMatch.index + answerMatch[0].length);
			if (before) {
				fn.appendThinkingDelta(before);
			}
			if (after) {
				fn.appendChatDelta(after);
			}
			return true;
		}
		if (fn.deltaBelongsInThinking(text)) {
			fn.appendThinkingDelta(text);
			return true;
		}
		fn.appendChatDelta(text);
		return true;
	};

	/** Point d'entrée unique pour les TextDelta moteur → fil linéaire. */
	fn.appendDelta = function (text, executorJobId) {
		if (!text) {
			return;
		}
		fn.routeSimpleDisplayDelta(text, executorJobId);
	};
})(globalThis.DroxChat);
