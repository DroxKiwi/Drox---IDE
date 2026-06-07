/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.ensurePhaseSummaryLabel = function(summaryEl) {
		if (!summaryEl) {
			return null;
		}
		let label = summaryEl.querySelector('.phase-summary-label');
		if (label) {
			return label;
		}
		const grid = summaryEl.querySelector('.activity-grid-inline');
		let text = '';
		for (const node of summaryEl.childNodes) {
			if (node === grid) {
				continue;
			}
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || '';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				text += node.textContent || '';
			}
		}
		summaryEl.textContent = '';
		if (grid) {
			summaryEl.appendChild(grid);
		}
		label = document.createElement('span');
		label.className = 'phase-summary-label';
		label.textContent = text.trim();
		summaryEl.appendChild(label);
		return label;
	}

	fn.setPhaseSummaryLabel = function(summaryEl, text) {
		const label = fn.ensurePhaseSummaryLabel(summaryEl);
		if (label) {
			label.textContent = text;
		}
	}

})(globalThis.DroxChat);
