/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	/** Un seul sticky user : le dernier message utilisateur du fil. */
	fn.refreshLastUserStickyRow = function () {
		if (!D.dom.logEl) {
			return;
		}
		const rows = fn.queryUserMessageRows?.(D.dom.logEl) ?? [
			...D.dom.logEl.querySelectorAll(':scope > .msg-row-user'),
		];
		for (const row of rows) {
			row.classList.remove('is-last-user-sticky');
		}
		const last = rows.length > 0 ? rows[rows.length - 1] : null;
		if (last) {
			last.classList.add('is-last-user-sticky');
		}
	};
})(globalThis.DroxChat);
