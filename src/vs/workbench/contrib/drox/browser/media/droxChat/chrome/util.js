/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.randomId = function() {
		return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	}
})(globalThis.DroxChat);
