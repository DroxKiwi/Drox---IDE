/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const DISCLOSURE_CHEVRON_SVG =
		'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M4 6l4 4 4-4"></path></svg>';

	fn.createDisclosureToggle = function (opts) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'drox-disclosure-toggle';
		if (opts?.extraClass) {
			btn.classList.add(opts.extraClass);
		}
		const expanded = opts?.expanded !== false;
		btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		btn.title = opts?.title || 'Expand / collapse';
		btn.innerHTML = DISCLOSURE_CHEVRON_SVG;
		return btn;
	};

	fn.syncDisclosureToggle = function (toggleBtn, expanded) {
		if (!toggleBtn) {
			return;
		}
		toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
	};

	fn.enhanceDetailsDisclosure = function (details) {
		if (!details || details.dataset.droxDisclosureEnhanced === '1') {
			return;
		}
		const summary = details.querySelector(':scope > summary');
		if (!summary) {
			return;
		}
		details.dataset.droxDisclosureEnhanced = '1';
		const toggleBtn = fn.createDisclosureToggle({ expanded: details.open });
		summary.insertBefore(toggleBtn, summary.firstChild);

		const sync = () => {
			fn.syncDisclosureToggle(toggleBtn, details.open);
		};

		toggleBtn.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			details.open = !details.open;
			sync();
		});

		details.addEventListener('toggle', sync);
		sync();
	};

	fn.enhanceDisclosuresUnder = function (rootEl) {
		const root = rootEl || D.dom.logEl;
		if (!root?.querySelectorAll) {
			return;
		}
		for (const details of root.querySelectorAll('details')) {
			fn.enhanceDetailsDisclosure(details);
		}
	};
})(globalThis.DroxChat);
