/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	/** @typedef {{ trayEl: HTMLDetailsElement, summaryEl: HTMLElement, innerEl: HTMLElement, count: number }} CollapsibleTray */

	fn.createCollapsibleTray = function (className, defaultSummary) {
		const tray = document.createElement('details');
		tray.className = className;
		tray.open = false;
		tray.hidden = true;
		const summary = document.createElement('summary');
		summary.textContent = defaultSummary;
		const inner = document.createElement('div');
		inner.className = 'drox-collapsible-tray-inner';
		tray.appendChild(summary);
		tray.appendChild(inner);
		tray.addEventListener('toggle', () => {
			if (tray.open) {
				fn.expandCollapsibleTrayInner(inner);
			} else {
				fn.collapseCollapsibleTrayInner(inner);
			}
		});
		return /** @type {CollapsibleTray} */ ({
			trayEl: tray,
			summaryEl: summary,
			innerEl: inner,
			count: 0,
		});
	};

	fn.collapseCollapsibleTrayInner = function (inner) {
		if (!inner) {
			return;
		}
		const items = [...inner.children];
		for (let i = 0; i < items.length; i++) {
			items[i].classList.toggle('drox-tray-stack-hidden', i < items.length - 1);
		}
	};

	fn.expandCollapsibleTrayInner = function (inner) {
		if (!inner) {
			return;
		}
		for (const child of inner.children) {
			child.classList.remove('drox-tray-stack-hidden');
		}
	};

	fn.pushCollapsibleTrayItem = function (tray, itemEl, previewHtml, title) {
		if (!tray?.trayEl || !tray.innerEl || !tray.summaryEl || !itemEl) {
			return;
		}
		if (!tray.trayEl.open) {
			for (const child of tray.innerEl.children) {
				child.classList.add('drox-tray-stack-hidden');
			}
		}
		tray.innerEl.appendChild(itemEl);
		tray.count += 1;
		tray.trayEl.hidden = false;
		tray.summaryEl.innerHTML = previewHtml || '';
		const n = tray.count;
		tray.summaryEl.title =
			title ||
			(n <= 1 ? 'Click to expand' : `${n} entries — click to expand full history`);
		if (!tray.trayEl.open) {
			fn.collapseCollapsibleTrayInner(tray.innerEl);
		}
	};

	fn.previewTextFromElement = function (el, maxLen = 220) {
		const raw = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
		if (!raw) {
			return '';
		}
		return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
	};

	fn.ensureExploreIssuesTray = function () {
		if (D.state.exploreIssuesTray?.trayEl?.isConnected) {
			return D.state.exploreIssuesTray;
		}
		const inner = fn.ensureExploreMetaTray();
		const tray = fn.createCollapsibleTray(
			'drox-explore-issues-tray',
			'Engine notice',
		);
		inner.insertBefore(tray.trayEl, inner.firstChild);
		D.state.exploreIssuesTray = tray;
		return tray;
	};

	fn.ensureLogIssuesTray = function () {
		if (D.state.logIssuesTray?.trayEl?.isConnected) {
			return D.state.logIssuesTray;
		}
		const tray = fn.createCollapsibleTray('drox-log-issues-tray', 'Notice');
		D.dom.logEl.appendChild(tray.trayEl);
		D.state.logIssuesTray = tray;
		return tray;
	};

	fn.appendChatIssue = function (el, previewHtml) {
		if (!el) {
			return;
		}
		fn.markChatIssueElement?.(el);
		const preview =
			previewHtml ||
			fn.previewTextFromElement(el) ||
			'Notice';
		if (D.state.exploreBodyEl) {
			const tray = fn.ensureExploreIssuesTray();
			fn.pushCollapsibleTrayItem(tray, el, preview);
			if (D.state.exploreMetaTrayEl) {
				D.state.exploreMetaTrayEl.hidden = false;
				const metaSummary = D.state.exploreMetaTrayEl.querySelector('.drox-explore-meta-summary');
				if (metaSummary) {
					metaSummary.textContent =
						tray.count <= 1 ? 'Engine notice' : `${tray.count} notices`;
				}
			}
			return;
		}
		const tray = fn.ensureLogIssuesTray();
		fn.pushCollapsibleTrayItem(tray, el, preview);
	};

	fn.ensureExploreToolsTrayState = function () {
		fn.ensureExploreToolsTray();
		if (!D.state.exploreToolsTrayState) {
			const tray = D.state.exploreToolsTrayEl;
			const summary = tray?.querySelector('.drox-explore-tools-summary');
			const inner = D.state.exploreToolsInnerEl;
			if (!tray || !summary || !inner) {
				return null;
			}
			tray.classList.add('drox-collapsible-tools-tray');
			summary.classList.add('drox-collapsible-tray-summary');
			inner.classList.add('drox-collapsible-tray-inner');
			tray.addEventListener('toggle', () => {
				if (tray.open) {
					fn.expandCollapsibleTrayInner(inner);
				} else {
					fn.collapseCollapsibleTrayInner(inner);
				}
			});
			D.state.exploreToolsTrayState = {
				trayEl: tray,
				summaryEl: summary,
				innerEl: inner,
				count: D.state.exploreToolLineCount || 0,
			};
		}
		return D.state.exploreToolsTrayState;
	};

	fn.updateExploreToolsTraySummary = function (lineEl) {
		const tray = fn.ensureExploreToolsTrayState();
		if (!tray?.summaryEl) {
			fn.updateExploreToolsSummary?.();
			return;
		}
		const verb = lineEl?.dataset?.verb || 'Ran';
		const target = lineEl?.dataset?.target || '';
		const running = lineEl?.classList?.contains('running');
		const preview = fn.formatExecutorActionSummary?.(verb, target, running) || `${verb} ${target}`;
		tray.summaryEl.innerHTML = preview;
		const n = tray.count || D.state.exploreToolLineCount || 0;
		tray.summaryEl.title =
			n <= 1 ? '1 tool — click for history' : `${n} tools — click for full history`;
		if (tray.trayEl) {
			tray.trayEl.hidden = n === 0;
		}
	};

	fn.ensureParentToolTray = function (parentEl, trayClass) {
		if (!parentEl) {
			return null;
		}
		if (!D.state.toolTraysByParent) {
			D.state.toolTraysByParent = new WeakMap();
		}
		const map = D.state.toolTraysByParent;
		let tray = map.get(parentEl);
		if (tray?.trayEl?.isConnected && tray.trayEl.parentElement === parentEl) {
			return tray;
		}
		tray = fn.createCollapsibleTray(trayClass, 'Waiting for first tool…');
		parentEl.insertBefore(tray.trayEl, parentEl.firstChild);
		map.set(parentEl, tray);
		return tray;
	};

	fn.resetCollapsibleTrayState = function () {
		D.state.exploreIssuesTray = null;
		D.state.logIssuesTray = null;
		D.state.exploreToolsTrayState = null;
		D.state.toolTraysByParent = null;
	};

	fn.mountToolBlockInTray = function (parentEl, details, previewHtml) {
		const trayClass =
			parentEl === D.dom.logEl
				? 'drox-log-tools-tray'
				: 'drox-section-tools-tray';
		const tray = fn.ensureParentToolTray(parentEl, trayClass);
		if (!tray) {
			parentEl.appendChild(details);
			return;
		}
		fn.pushCollapsibleTrayItem(tray, details, previewHtml);
	};

	fn.shouldUseCollapsibleToolTray = function (parentEl) {
		if (!parentEl) {
			return false;
		}
		if (parentEl === D.state.exploreToolsInnerEl) {
			return false;
		}
		if (parentEl.classList?.contains('executor-action-rail-list')) {
			return false;
		}
		if (parentEl.classList?.contains('executor-stream-tools')) {
			return false;
		}
		if (parentEl === D.dom.logEl || parentEl.classList?.contains('drox-run-section')) {
			return true;
		}
		return false;
	};
})(globalThis.DroxChat);
