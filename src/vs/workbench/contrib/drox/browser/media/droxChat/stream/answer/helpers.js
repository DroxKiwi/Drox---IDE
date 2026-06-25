/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	/** Retire le marqueur sticky user (le positionnement sticky est désactivé — conflit flex/#log). */
	fn.clearLastUserStickyRow = function () {
		if (!D.dom.logEl) {
			return;
		}
		const rows = fn.queryUserMessageRows?.(D.dom.logEl) ?? [
			...D.dom.logEl.querySelectorAll(':scope > .msg-row-user'),
		];
		for (const row of rows) {
			row.classList.remove('is-last-user-sticky');
		}
	};

	fn.refreshLastUserStickyRow = fn.clearLastUserStickyRow;
})(globalThis.DroxChat);
