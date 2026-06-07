/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	D.state.architectModel = '';
	D.state.executorModel = '';
	D.state.architectNumCtx = '';
	D.state.executorNumCtx = '';
	D.state.architectTopP = '';
	D.state.architectTopK = '';
	D.state.architectRepeatPenalty = '';
	D.state.architectMinP = '';
	D.state.architectSeed = '';
	D.state.architectTemperature = '';
	D.state.executorTopP = '';
	D.state.executorTopK = '';
	D.state.executorRepeatPenalty = '';
	D.state.executorMinP = '';
	D.state.executorSeed = '';
	D.state.executorTemperature = '';
	D.state.orchestrationMaxParallelExecutors = 1;
	D.state.rolePanelOpen = null;
})(globalThis.DroxChat);
