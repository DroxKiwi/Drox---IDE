/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.setInnerHtml = function (el, html) {
		if (!el) {
			return;
		}
		el.innerHTML = html;
	};

	fn.clearInnerHtml = function (el) {
		if (!el) {
			return;
		}
		el.replaceChildren();
	};
})(globalThis.DroxChat);
