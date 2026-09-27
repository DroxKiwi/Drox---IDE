/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	function readPatchNumber(raw) {
		if (raw === '') {
			return null;
		}
		const n = Number(raw);
		return Number.isFinite(n) ? n : undefined;
	}

	function assignStateNumber(stateKey, value) {
		if (value === null) {
			D.state[stateKey] = '';
			return;
		}
		if (value !== undefined && Number.isFinite(value)) {
			D.state[stateKey] = value;
		}
	}

	fn.persistRoleModelFromPanel = function() {
		if (D.state.rolePanelOpen !== 'architect') {
			return;
		}
		const select = D.dom.roleModelPanelSelectEl;
		const model = select ? select.value.trim() : '';
		D.state.architectModel = model;
		D.vscode.postMessage({ type: 'setArchitectModel', model });
		const numCtx = fn.readArchitectNumCtxFromPanel();
		const temperature = readPatchNumber(D.dom.roleModelPanelTemperatureEl?.value.trim() ?? '');
		const topP = readPatchNumber(D.dom.roleModelPanelTopPEl?.value.trim() ?? '');
		const topK = readPatchNumber(D.dom.roleModelPanelTopKEl?.value.trim() ?? '');
		const repeatPenalty = readPatchNumber(D.dom.roleModelPanelRepeatPenaltyEl?.value.trim() ?? '');
		const minP = readPatchNumber(D.dom.roleModelPanelMinPEl?.value.trim() ?? '');
		const seed = readPatchNumber(D.dom.roleModelPanelSeedEl?.value.trim() ?? '');
		const presencePenalty = readPatchNumber(D.dom.roleModelPanelPresencePenaltyEl?.value.trim() ?? '');
		const frequencyPenalty = readPatchNumber(D.dom.roleModelPanelFrequencyPenaltyEl?.value.trim() ?? '');
		const maxTokens = readPatchNumber(D.dom.roleModelPanelMaxTokensEl?.value.trim() ?? '');
		const keepAliveRaw = D.dom.roleModelPanelKeepAliveEl?.value.trim() ?? '';
		const keepAlive = keepAliveRaw === '' ? null : keepAliveRaw;
		if (numCtx !== undefined) {
			D.state.architectNumCtx = numCtx;
		}
		assignStateNumber('architectTemperature', temperature);
		assignStateNumber('architectTopP', topP);
		assignStateNumber('architectTopK', topK);
		assignStateNumber('architectRepeatPenalty', repeatPenalty);
		assignStateNumber('architectMinP', minP);
		assignStateNumber('architectSeed', seed);
		assignStateNumber('architectPresencePenalty', presencePenalty);
		assignStateNumber('architectFrequencyPenalty', frequencyPenalty);
		assignStateNumber('architectMaxTokens', maxTokens);
		D.state.architectKeepAlive = keepAlive === null ? '' : keepAlive;
		const mutedParams = Array.isArray(D.state.architectLlmParamsMuted)
			? [...D.state.architectLlmParamsMuted].filter(k => typeof k === 'string')
			: [];
		D.vscode.postMessage({
			type: 'setArchitectLlmParams',
			numCtx,
			temperature,
			topP,
			topK,
			repeatPenalty,
			minP,
			seed,
			presencePenalty,
			frequencyPenalty,
			maxTokens,
			keepAlive,
			mutedParams,
		});
		fn.syncRoleModelVignetteHints();
		if (D.dom.llmModelPickerEl) {
			D.state.selectedLlmModel = model;
			D.dom.llmModelPickerEl.value = model;
		}
	};
})(globalThis.DroxChat);
