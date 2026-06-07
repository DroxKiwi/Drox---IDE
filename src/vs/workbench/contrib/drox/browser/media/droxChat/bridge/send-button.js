/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.handleSendButtonClick = function() {
		if (D.state.busy) {
			fn.abortRunLocally();
			D.vscode.postMessage({ type: 'cancelRun' });
			return;
		}
		fn.doSend();
	}
})(globalThis.DroxChat);
