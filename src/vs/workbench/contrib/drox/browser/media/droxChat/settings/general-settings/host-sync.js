/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.applyGeneralSettingsFromHost = function(payload) {
		if (!payload || typeof payload !== 'object') {
			return;
		}
		const s = payload.settings && typeof payload.settings === 'object' ? payload.settings : payload;
		D.state.generalSettings = { ...D.state.generalSettings, ...s };
		fn.syncGeneralSettingsVignetteHint();
		if (D.state.generalSettingsPanelOpen) {
			fn.fillGeneralSettingsPanel();
		}
		if (typeof fn.syncChatErrorsWarningsVisibility === 'function') {
			fn.syncChatErrorsWarningsVisibility();
		}
	};
})(globalThis.DroxChat);
