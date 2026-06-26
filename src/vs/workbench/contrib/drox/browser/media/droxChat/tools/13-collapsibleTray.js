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
		tray.open = true;
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

	fn.ensureLogIssuesTray = function () {
		if (D.state.logIssuesTray?.trayEl?.isConnected) {
			return D.state.logIssuesTray;
		}
		const tray = fn.createCollapsibleTray('drox-log-issues-tray', 'Notice');
		fn.appendToLog?.(tray.trayEl);
		D.state.logIssuesTray = tray;
		return tray;
	};

	fn.appendChatIssue = function (el, _previewHtml) {
		if (!el) {
			return;
		}
		fn.markChatIssueElement?.(el);
		fn.appendToLog?.(el);
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
		D.state.logIssuesTray = null;
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

	fn.shouldUseCollapsibleToolTray = function () {
		return false;
	};
})(globalThis.DroxChat);
