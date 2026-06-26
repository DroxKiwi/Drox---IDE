/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Fil lineaire append-only : plan, work, thinking, answer (pas de promotion Exploring).

(function (D) {
	const fn = D.fn;
	/** Un seul panneau Thinking dans `[data-section="thinking"]` — reparent les copies égarées (ex. section Answer). */
	fn.normalizeLinearThinkingLayout = function (strip) {
		strip = strip || D.state.runStripEl;
		if (!strip?.isConnected || !D.state.linearRunUi) {
			return;
		}
		const thinkSec = strip.querySelector('[data-section="thinking"]');
		if (!thinkSec) {
			return;
		}
		for (const panel of [...strip.querySelectorAll('.drox-linear-thinking')]) {
			if (panel.parentElement !== thinkSec) {
				thinkSec.appendChild(panel);
			}
		}
		fn.consolidateLinearThinkingShells(thinkSec);
		fn.dedupeIdenticalThinkingPanels(thinkSec);
		const canonHost = thinkSec.querySelector('.drox-linear-thinking-host');
		for (const secName of ['answer', 'work', 'verify']) {
			const sec = strip.querySelector(`[data-section="${secName}"]`);
			if (!sec) {
				continue;
			}
			for (const stray of [...sec.querySelectorAll(':scope > .drox-linear-thinking-host')]) {
				if (stray.closest('.drox-linear-thinking')?.parentElement === thinkSec) {
					continue;
				}
				if (canonHost) {
					const extra = String(stray.dataset?.raw || stray.textContent || '').trim();
					if (extra && !String(canonHost.dataset.raw || '').includes(extra.slice(0, 48))) {
						canonHost.dataset.raw = canonHost.dataset.raw
							? `${canonHost.dataset.raw}\n\n${extra}`
							: extra;
						if (typeof fn.setAssistantMarkdown === 'function') {
							fn.setAssistantMarkdown(canonHost, canonHost.dataset.raw);
						}
					}
				}
				stray.remove();
			}
		}
	};

	fn.dedupeIdenticalThinkingPanels = function (section) {
		if (!section) {
			return;
		}
		const shells = [...section.querySelectorAll(':scope > .drox-linear-thinking')];
		const seen = new Set();
		for (const shell of shells) {
			const host = shell.querySelector('.drox-linear-thinking-host');
			const raw = String(host?.dataset?.raw ?? host?.textContent ?? '').trim();
			if (!raw) {
				shell.remove();
				continue;
			}
			if (seen.has(raw)) {
				shell.remove();
				continue;
			}
			seen.add(raw);
		}
	};

	fn.consolidateLinearThinkingShells = function (section) {
		if (!section) {
			return;
		}
		fn.dedupeIdenticalThinkingPanels(section);
		const shells = [...section.querySelectorAll(':scope > .drox-linear-thinking')];
		if (shells.length <= 1) {
			return;
		}
		const primary = shells[0];
		const host = primary.querySelector('.drox-linear-thinking-host');
		if (!host) {
			return;
		}
		let merged = String(host.dataset.raw || '').trim();
		for (let i = 1; i < shells.length; i++) {
			const otherHost = shells[i].querySelector('.drox-linear-thinking-host');
			const chunk = String(otherHost?.dataset?.raw || otherHost?.textContent || '').trim();
			if (chunk) {
				merged = merged ? `${merged}\n\n---\n\n${chunk}` : chunk;
			}
			shells[i].remove();
		}
		if (merged) {
			host.dataset.raw = merged;
			if (typeof fn.setAssistantMarkdown === 'function') {
				fn.setAssistantMarkdown(host, merged);
			}
		}
	};

	/** Nouveau tour gate sans réponse utilisateur entre deux — fusion dans le même panneau Thinking. */
	fn.beginGateThinkingTurn = function () {
		const section = fn.getRunSection('thinking');
		if (!section) {
			return;
		}
		fn.consolidateLinearThinkingShells(section);
		const host = section.querySelector('.drox-linear-thinking-host');
		if (!host) {
			return;
		}
		const prior = String(host.dataset.raw || '').trim();
		if (!prior || prior.endsWith('\n---\n')) {
			return;
		}
		host.dataset.raw = `${prior}\n\n---\n\n`;
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(host, host.dataset.raw);
		}
	};

	fn.ensureLinearThinkingShell = function () {
		if (D.state.runStripEl?.isConnected) {
			fn.normalizeLinearThinkingLayout(D.state.runStripEl);
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
			fn.enhanceDetailsDisclosure?.(details);
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
	fn.appendLinearThinkingDelta = function (text, _executorJobId) {
		const host = fn.ensureLinearThinkingShell();
		if (!host) {
			return false;
		}
		if (!text) {
			return true;
		}
		const prior = String(host.dataset.raw || '');
		if (text && prior.endsWith(text)) {
			return true;
		}
		host.dataset.raw = prior + text;
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(host, host.dataset.raw);
		} else {
			host.textContent = host.dataset.raw;
		}
		fn.touchArchitectRunTailActivity?.();
		return true;
	};

})(globalThis.DroxChat);
