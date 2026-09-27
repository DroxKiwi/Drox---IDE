/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	function applyArchitectNumber(stateKey, value) {
		if (value !== undefined && value !== null) {
			D.state[stateKey] = value;
		}
	}

	fn.applyRoleModelsFromHost = function(payload) {
		if (typeof payload.architectModel === 'string') {
			D.state.architectModel = payload.architectModel.trim();
		}
		if (payload.architectNumCtx !== undefined && payload.architectNumCtx !== null) {
			const n = D.fn.clampArchitectNumCtx(payload.architectNumCtx);
			D.state.architectNumCtx = n;
			if (D.state.rolePanelOpen !== 'architect') {
				D.state.architectNumCtxCustomMode = !D.fn.isArchitectNumCtxPreset(n);
			}
		}
		applyArchitectNumber('architectTemperature', payload.architectTemperature);
		applyArchitectNumber('architectTopP', payload.architectTopP);
		applyArchitectNumber('architectTopK', payload.architectTopK);
		applyArchitectNumber('architectRepeatPenalty', payload.architectRepeatPenalty);
		applyArchitectNumber('architectMinP', payload.architectMinP);
		applyArchitectNumber('architectSeed', payload.architectSeed);
		applyArchitectNumber('architectPresencePenalty', payload.architectPresencePenalty);
		applyArchitectNumber('architectFrequencyPenalty', payload.architectFrequencyPenalty);
		applyArchitectNumber('architectMaxTokens', payload.architectMaxTokens);
		if (typeof payload.architectKeepAlive === 'string') {
			D.state.architectKeepAlive = payload.architectKeepAlive;
		}
		if (Array.isArray(payload.architectLlmParamsMuted)) {
			D.state.architectLlmParamsMuted = payload.architectLlmParamsMuted.filter(k => typeof k === 'string');
		}
		if (typeof fn.syncRoleModelMuteButtonsFromState === 'function') {
			fn.syncRoleModelMuteButtonsFromState();
		}
		fn.syncRoleModelVignetteHints();
		if (typeof fn.renderStatus === 'function') {
			fn.renderStatus();
		}
		if (D.state.rolePanelOpen === 'architect' && typeof fn.syncRoleModelPanelFieldsFromState === 'function') {
			fn.syncRoleModelPanelFieldsFromState();
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
