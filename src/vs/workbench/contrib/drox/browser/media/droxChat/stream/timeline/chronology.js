/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil append-only — parité `apply_agent_event` / `LogEntry` (drox-tui).

(function (D) {
	const fn = D.fn;

	/** Marqueurs `[phase: …]` — alignés sur `Phase::as_marker` (drox-engine). */
	const PHASE_MARKER = {
		internal_reasoning: 'internal_reasoning',
		reasoning: 'internal_reasoning',
		analyzing: 'analyzing',
		reading: 'reading',
		clarifying: 'clarifying',
		planning: 'planning',
		acting: 'acting',
		testing: 'testing',
		verifying: 'verifying',
		answering: 'answering',
		done: 'done',
	};

	/** Short English phase labels — aligned with TUI markers, readable in the IDE. */
	const PHASE_LABEL = {
		internal_reasoning: 'Reasoning',
		analyzing: 'Analyzing',
		reading: 'Reading',
		clarifying: 'Clarifying',
		planning: 'Planning',
		acting: 'Acting',
		testing: 'Testing',
		verifying: 'Verifying',
		answering: 'Answering',
		done: 'Done',
	};

	fn.formatPhaseMarkerLabel = function (phase, countHint) {
		const canon = PHASE_MARKER[phase] || phase;
		const label = PHASE_LABEL[canon] || PHASE_LABEL[phase] || canon;
		const hint = countHint != null ? countHint : '';
		return `── [${label}] ──${hint}`;
	};

	D.state.streamTextBuffer = '';
	D.state.streamPhaseLineEl = null;
	D.state.streamPhaseBlockEl = null;
	D.state.streamPhaseBlockBodyEl = null;

	fn.resetStreamChronology = function () {
		D.state.streamTextBuffer = '';
		D.state.streamPhaseLineEl = null;
		D.state.streamPhaseBlockEl = null;
		D.state.streamPhaseBlockBodyEl = null;
	};

	fn.ensureChronologySection = function (strip) {
		strip = strip || D.state.runStripEl;
		if (!strip) {
			return null;
		}
		let sec = strip.querySelector('[data-section="chronology"]');
		if (sec) {
			return sec;
		}
		const work = strip.querySelector('details.drox-run-work-collapsible');
		if (work) {
			sec = work.querySelector('[data-section="chronology"]');
			if (sec) {
				return sec;
			}
		}
		for (const name of ['work', 'thinking', 'verify', 'plan']) {
			const legacy = strip.querySelector(`[data-section="${name}"]`);
			if (legacy) {
				return legacy;
			}
		}
		return null;
	};

	fn.getChronologyMount = function () {
		if (!D.state.linearRunUi) {
			return null;
		}
		const strip =
			typeof fn.ensureRunStrip === 'function' ? fn.ensureRunStrip() : D.state.runStripEl;
		const inStrip = (el) => Boolean(strip && el && strip.contains(el));
		if (D.state.streamPhaseBlockBodyEl?.isConnected) {
			if (inStrip(D.state.streamPhaseBlockBodyEl)) {
				return D.state.streamPhaseBlockBodyEl;
			}
			D.state.streamPhaseBlockBodyEl = null;
			D.state.streamPhaseBlockEl = null;
			D.state.streamPhaseLineEl = null;
		}
		const phase = D.state.currentPhase;
		if (phase && phase !== 'answering' && phase !== 'done') {
			return fn.ensurePhaseBlock(phase);
		}
		return fn.ensureChronologySection(strip);
	};

	fn.syncPhaseBlockSummary = function (block) {
		if (!block) {
			return;
		}
		const summary = block.querySelector('.phase-summary');
		const body = block.querySelector('.phase-body');
		if (!summary) {
			return;
		}
		const phase = block.dataset.phase || '';
		const marker = PHASE_MARKER[phase] || phase;
		let label = summary.querySelector('.phase-summary-label');
		if (!label) {
			summary.textContent = '';
			label = document.createElement('span');
			label.className = 'phase-summary-label';
			summary.appendChild(label);
		}
		const n = body?.childElementCount || 0;
		const countHint = n > 0 ? ` · ${n}` : '';
		label.textContent = fn.formatPhaseMarkerLabel(marker, countHint);
	};

	const REASONING_PHASES = new Set(['internal_reasoning', 'reasoning']);

	fn.phaseBlockHasShellTools = function (block) {
		const body = block?.querySelector('.phase-body');
		if (!body) {
			return false;
		}
		return Boolean(body.querySelector('.drox-shell-card'));
	};

	fn.phaseBlockHasFileChanges = function (block) {
		const body = block?.querySelector('.phase-body');
		if (!body) {
			return false;
		}
		return Boolean(body.querySelector('.msg-file-change'));
	};

	fn.shouldKeepReasoningPhaseOpen = function (block) {
		if (!block?.dataset?.phase) {
			return false;
		}
		return REASONING_PHASES.has(block.dataset.phase) && fn.phaseBlockHasShellTools(block);
	};

	fn.shouldKeepPhaseOpen = function (block) {
		return fn.phaseBlockHasFileChanges(block) || fn.shouldKeepReasoningPhaseOpen(block);
	};

	fn.closeActivePhaseBlock = function () {
		const block = D.state.streamPhaseBlockEl;
		if (!block?.isConnected) {
			D.state.streamPhaseBlockEl = null;
			D.state.streamPhaseBlockBodyEl = null;
			return;
		}
		block.classList.remove('streaming', 'drox-phase-block--active');
		block.classList.add('drox-phase-block--done');
		const pinOpen = fn.shouldKeepPhaseOpen(block);
		block.open = pinOpen;
		block.classList.toggle('drox-phase-block--pinned-open', pinOpen);
		fn.syncPhaseBlockSummary(block);
		if (D.state.streamPhaseLineEl?.closest('.phase-block') === block) {
			D.state.streamPhaseLineEl = null;
		}
		D.state.streamPhaseBlockEl = null;
		D.state.streamPhaseBlockBodyEl = null;
	};

	fn.ensurePhaseBlock = function (phase) {
		const p = String(phase || '').trim();
		if (!p || p === 'answering' || p === 'done') {
			return null;
		}
		if (D.state.streamPhaseBlockEl?.dataset?.phase === p) {
			return D.state.streamPhaseBlockBodyEl;
		}
		fn.closeActivePhaseBlock();
		const strip = typeof fn.ensureRunStrip === 'function' ? fn.ensureRunStrip() : D.state.runStripEl;
		const chronology = fn.ensureChronologySection(strip);
		if (!chronology) {
			return null;
		}
		const details = document.createElement('details');
		details.className = 'phase-block msg-ai-frame drox-log-indent drox-phase-block--active';
		details.dataset.phase = p;
		details.open = true;
		if (D.state.busy) {
			details.classList.add('streaming');
		}
		const summary = document.createElement('summary');
		summary.className = 'phase-summary';
		const label = document.createElement('span');
		label.className = 'phase-summary-label';
		label.textContent = fn.formatPhaseMarkerLabel(p);
		summary.appendChild(label);
		const body = document.createElement('div');
		body.className = 'phase-body';
		details.appendChild(summary);
		details.appendChild(body);
		chronology.appendChild(details);
		details.addEventListener('toggle', () => {
			fn.syncPhaseBlockSummary(details);
		});
		D.state.streamPhaseBlockEl = details;
		D.state.streamPhaseBlockBodyEl = body;
		D.state.streamPhaseLineEl = null;
		D.state.currentPhaseEl = details;
		fn.syncWorkSummaryStats?.(strip);
		return body;
	};

	fn.appendPhaseMarker = function (phase) {
		const p = String(phase || '').trim();
		if (!p) {
			return;
		}
		fn.closeActivePhaseBlock();
		if (p === 'answering') {
			D.state.currentPhaseEl = null;
			return;
		}
		if (p === 'done') {
			const mount = fn.ensureChronologySection(D.state.runStripEl);
			if (mount) {
				const el = document.createElement('div');
				el.className = 'drox-phase-marker';
				el.textContent = fn.formatPhaseMarkerLabel('done');
				mount.appendChild(el);
			}
			D.state.currentPhaseEl = null;
			fn.syncWorkSummaryStats?.(D.state.runStripEl);
			return;
		}
		fn.ensurePhaseBlock(p);
	};

	fn.mountStreamPhaseLine = function (text, opts) {
		const raw = String(text || '').trim();
		if (!raw) {
			return null;
		}
		const mount = fn.getChronologyMount();
		if (!mount) {
			return null;
		}
		const el = document.createElement('div');
		const variant = opts?.variant === 'assistant' ? 'assistant' : 'phase';
		el.className =
			variant === 'assistant'
				? 'drox-chronology-assistant msg assistant markdown'
				: 'drox-phase-line msg assistant markdown';
		if (opts?.streaming) {
			el.classList.add('streaming');
		}
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(el, raw);
		} else {
			el.textContent = raw;
		}
		mount.appendChild(el);
		fn.syncPhaseBlockSummary(D.state.streamPhaseBlockEl);
		return el;
	};

	fn.flushStreamBuffer = function (opts) {
		const tuiAssistant = opts?.asAnswer === true;
		const raw = String(D.state.streamTextBuffer || '');
		D.state.streamTextBuffer = '';
		const text = raw.trim();
		const liveLine = D.state.streamPhaseLineEl;
		if (liveLine?.isConnected) {
			liveLine.classList.remove('streaming');
			if (text) {
				if (typeof fn.setAssistantMarkdown === 'function') {
					fn.setAssistantMarkdown(liveLine, text);
				} else {
					liveLine.textContent = text;
				}
				D.state.streamPhaseLineEl = null;
				fn.syncPhaseBlockSummary(D.state.streamPhaseBlockEl);
				if (tuiAssistant && D.state.currentPhase === 'answering') {
					liveLine.remove();
					fn.appendChatDelta(text);
					return;
				}
				return;
			}
			liveLine.remove();
		}
		D.state.streamPhaseLineEl = null;
		if (!text) {
			return;
		}
		if (tuiAssistant && D.state.currentPhase === 'answering') {
			fn.appendChatDelta(text);
			return;
		}
		fn.mountStreamPhaseLine(text, {
			streaming: false,
			variant: 'phase',
		});
	};

	fn.appendStreamBufferDelta = function (text) {
		if (!text) {
			return;
		}
		if (D.state.currentPhase === 'answering') {
			fn.appendChatDelta(text);
			return;
		}
		D.state.streamTextBuffer = (D.state.streamTextBuffer || '') + text;
		const mount = fn.getChronologyMount();
		if (!mount) {
			return;
		}
		let el = D.state.streamPhaseLineEl;
		if (!el?.isConnected || el.parentElement !== mount) {
			el = document.createElement('div');
			el.className = 'drox-phase-line msg assistant markdown streaming';
			mount.appendChild(el);
			D.state.streamPhaseLineEl = el;
		}
		const raw = D.state.streamTextBuffer;
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(el, raw);
		} else {
			el.textContent = raw;
		}
		el.classList.toggle('streaming', Boolean(D.state.busy));
		if (D.state.streamPhaseBlockEl) {
			D.state.streamPhaseBlockEl.classList.toggle('streaming', Boolean(D.state.busy));
		}
		fn.syncPhaseBlockSummary(D.state.streamPhaseBlockEl);
	};

	fn.collapseRunWorkSection = function (strip, opts) {
		strip = strip || D.state.runStripEl;
		fn.closeActivePhaseBlock();
		if (!strip) {
			return;
		}
		const work = strip.querySelector('details.drox-run-work-collapsible');
		if (work) {
			const keepOpen =
				opts?.keepOpen === true ||
				(opts?.keepOpen !== false && D.state.busy && strip.dataset.sealed !== '1');
			work.open = keepOpen;
		}
		for (const line of strip.querySelectorAll('.drox-phase-line.streaming')) {
			line.classList.remove('streaming');
		}
		for (const block of strip.querySelectorAll('.phase-block.streaming')) {
			block.classList.remove('streaming');
		}
		fn.clearAllActivityGrids?.(strip);
	};
})(globalThis.DroxChat);
