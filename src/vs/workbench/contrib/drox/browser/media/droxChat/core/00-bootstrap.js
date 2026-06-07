/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (global) {
	const D = global.DroxChat || (global.DroxChat = { dom: {}, state: {}, const: {}, fn: {} });
	D.vscode = acquireVsCodeApi();
})(typeof globalThis !== "undefined" ? globalThis : window);
