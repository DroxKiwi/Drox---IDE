/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
(function (D) {
	const fn = D.fn;
	fn.unlockArchitectEditRunPresentation = function () {
		// no-op — conservé pour compat hooks UI edit
	};
	fn.syncDiscussionRunFromGatePayload = function (_payload) {
		// no-op — routage gate retiré
	};
})(globalThis.DroxChat);
