/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	D.const.MODE_STORAGE_KEY = 'drox.permissionMode';
	D.const.DEFAULT_PERMISSION_MODE = 'imNotCrazy';
	D.const.VALID_MODES = new Set(['analyze', 'trustEdit', 'imNotCrazy']);
	D.const.LEGACY_MODE_MAP = {
		default: 'imNotCrazy',
		plan: 'analyze',
		acceptEdits: 'trustEdit',
		bypassPermissions: 'trustEdit',
	};
})(globalThis.DroxChat);
