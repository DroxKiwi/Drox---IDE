/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	D.state.generalSettings = {};
	D.state.generalSettingsPanelOpen = false;
	D.state.connectionWizard = {
		open: false,
		step: 1,
		hosting: null,
		provider: null,
		server: '',
		apiKey: '',
		formValues: {},
		headers: [{ name: '', value: '' }],
	};
})(globalThis.DroxChat);
