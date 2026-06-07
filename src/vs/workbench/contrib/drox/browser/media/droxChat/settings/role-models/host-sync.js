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
		if (typeof payload.executorModel === 'string') {
			D.state.executorModel = fn.normalizeExecutorModelSetting(payload.executorModel);
		}
		if (payload.architectNumCtx !== undefined && payload.architectNumCtx !== null) {
			D.state.architectNumCtx = payload.architectNumCtx;
		}
		if (payload.executorNumCtx !== undefined && payload.executorNumCtx !== null) {
			D.state.executorNumCtx = payload.executorNumCtx;
		}
		if (fn.isExecutorSameAsArchitect() && payload.architectNumCtx !== undefined && payload.architectNumCtx !== null) {
			D.state.executorNumCtx = payload.architectNumCtx;
		}
		if (payload.architectTopP !== undefined && payload.architectTopP !== null) {
			D.state.architectTopP = payload.architectTopP;
			D.state.executorTopP = payload.architectTopP;
		}
		if (payload.architectTopK !== undefined && payload.architectTopK !== null) {
			D.state.architectTopK = payload.architectTopK;
			D.state.executorTopK = payload.architectTopK;
		}
		if (payload.architectRepeatPenalty !== undefined && payload.architectRepeatPenalty !== null) {
			D.state.architectRepeatPenalty = payload.architectRepeatPenalty;
			D.state.executorRepeatPenalty = payload.architectRepeatPenalty;
		}
		if (payload.architectMinP !== undefined && payload.architectMinP !== null) {
			D.state.architectMinP = payload.architectMinP;
			D.state.executorMinP = payload.architectMinP;
		}
		if (payload.architectSeed !== undefined && payload.architectSeed !== null) {
			D.state.architectSeed = payload.architectSeed;
			D.state.executorSeed = payload.architectSeed;
		}
		if (payload.architectTemperature !== undefined && payload.architectTemperature !== null) {
			D.state.architectTemperature = payload.architectTemperature;
			D.state.executorTemperature = payload.architectTemperature;
		}
		if (
			payload.orchestrationMaxParallelExecutors !== undefined &&
			payload.orchestrationMaxParallelExecutors !== null
		) {
			D.state.orchestrationMaxParallelExecutors = payload.orchestrationMaxParallelExecutors;
		}
		fn.syncRoleModelVignetteHints();
		if (D.state.rolePanelOpen) {
			fn.openRoleModelPanel(D.state.rolePanelOpen);
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
		if (typeof payload.executorModel === 'string') {
			D.state.executorModel = fn.normalizeExecutorModelSetting(payload.executorModel);
		}
		fn.applyRoleModelsFromHost(payload);
	};
})(globalThis.DroxChat);
