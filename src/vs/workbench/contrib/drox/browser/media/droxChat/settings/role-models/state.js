/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	D.state.architectModel = '';
	D.state.architectNumCtx = '';
	D.state.architectTopP = '';
	D.state.architectTopK = '';
	D.state.architectRepeatPenalty = '';
	D.state.architectMinP = '';
	D.state.architectSeed = '';
	D.state.architectTemperature = '';
	D.state.architectPresencePenalty = '';
	D.state.architectFrequencyPenalty = '';
	D.state.architectMaxTokens = '';
	D.state.architectKeepAlive = '';
	D.state.architectNumCtxCustomMode = false;
	D.state.rolePanelOpen = null;
})(globalThis.DroxChat);
