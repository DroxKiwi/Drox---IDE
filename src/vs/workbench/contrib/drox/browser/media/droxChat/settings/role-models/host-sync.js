/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.applyRoleModelsFromHost = function(payload) {
		if (typeof payload.architectModel === 'string') {
			D.state.architectModel = payload.architectModel.trim();
		}
		if (payload.architectNumCtx !== undefined && payload.architectNumCtx !== null) {
			D.state.architectNumCtx = D.fn.normalizeArchitectNumCtx(payload.architectNumCtx);
		}
		if (payload.architectTopP !== undefined && payload.architectTopP !== null) {
			D.state.architectTopP = payload.architectTopP;
		}
		if (payload.architectTopK !== undefined && payload.architectTopK !== null) {
			D.state.architectTopK = payload.architectTopK;
		}
		if (payload.architectRepeatPenalty !== undefined && payload.architectRepeatPenalty !== null) {
			D.state.architectRepeatPenalty = payload.architectRepeatPenalty;
		}
		if (payload.architectMinP !== undefined && payload.architectMinP !== null) {
			D.state.architectMinP = payload.architectMinP;
		}
		if (payload.architectSeed !== undefined && payload.architectSeed !== null) {
			D.state.architectSeed = payload.architectSeed;
		}
		if (payload.architectTemperature !== undefined && payload.architectTemperature !== null) {
			D.state.architectTemperature = payload.architectTemperature;
		}
		fn.syncRoleModelVignetteHints();
		if (D.state.rolePanelOpen === 'architect') {
			fn.openRoleModelPanel();
		}
	};

	const prevApplyLlm = fn.applyLlmModelsFromHost;
	fn.applyLlmModelsFromHost = function(payload) {
		prevApplyLlm(payload);
		if (typeof payload.architectModel === 'string') {
			D.state.architectModel = payload.architectModel.trim();
		} else if (typeof payload.selected === 'string' && payload.selected.trim()) {
			D.state.architectModel = payload.selected.trim();
		}
		fn.applyRoleModelsFromHost(payload);
	};
})(globalThis.DroxChat);
