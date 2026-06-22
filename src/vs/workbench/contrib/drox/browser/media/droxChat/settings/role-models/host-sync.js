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
			D.state.architectNumCtx = D.fn.clampArchitectNumCtx(payload.architectNumCtx);
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
