/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.persistRoleModelFromPanel = function() {
		if (D.state.rolePanelOpen !== 'architect') {
			return;
		}
		const select = D.dom.roleModelPanelSelectEl;
		const model = select ? select.value.trim() : '';
		D.state.architectModel = model;
		D.vscode.postMessage({ type: 'setArchitectModel', model });
		const numCtxRaw = D.dom.roleModelPanelNumCtxEl?.value.trim() ?? '';
		const numCtx = numCtxRaw === '' ? undefined : D.fn.normalizeArchitectNumCtx(Number(numCtxRaw));
		const topPRaw = D.dom.roleModelPanelTopPEl?.value.trim() ?? '';
		const topP = topPRaw === '' ? undefined : Number(topPRaw);
		const topKRaw = D.dom.roleModelPanelTopKEl?.value.trim() ?? '';
		const topK = topKRaw === '' ? undefined : Number(topKRaw);
		const repeatPenaltyRaw = D.dom.roleModelPanelRepeatPenaltyEl?.value.trim() ?? '';
		const repeatPenalty = repeatPenaltyRaw === '' ? undefined : Number(repeatPenaltyRaw);
		const minPRaw = D.dom.roleModelPanelMinPEl?.value.trim() ?? '';
		const minP = minPRaw === '' ? undefined : Number(minPRaw);
		const seedRaw = D.dom.roleModelPanelSeedEl?.value.trim() ?? '';
		const seed = seedRaw === '' ? undefined : Number(seedRaw);
		const tempRaw = D.dom.roleModelPanelTemperatureEl?.value.trim() ?? '';
		const temperature = tempRaw === '' ? undefined : Number(tempRaw);
		if (numCtx !== undefined) {
			D.state.architectNumCtx = numCtx;
		}
		if (topP !== undefined && Number.isFinite(topP)) {
			D.state.architectTopP = topP;
		}
		if (topK !== undefined && Number.isFinite(topK)) {
			D.state.architectTopK = topK;
		}
		if (repeatPenalty !== undefined && Number.isFinite(repeatPenalty)) {
			D.state.architectRepeatPenalty = repeatPenalty;
		}
		if (minP !== undefined && Number.isFinite(minP)) {
			D.state.architectMinP = minP;
		}
		if (seed !== undefined && Number.isFinite(seed)) {
			D.state.architectSeed = seed;
		}
		if (temperature !== undefined && Number.isFinite(temperature)) {
			D.state.architectTemperature = temperature;
		}
		D.vscode.postMessage({
			type: 'setArchitectLlmParams',
			numCtx,
			topP: Number.isFinite(topP) ? topP : undefined,
			topK: Number.isFinite(topK) ? topK : undefined,
			repeatPenalty: Number.isFinite(repeatPenalty) ? repeatPenalty : undefined,
			minP: Number.isFinite(minP) ? minP : undefined,
			seed: Number.isFinite(seed) ? seed : undefined,
			temperature: Number.isFinite(temperature) ? temperature : undefined,
		});
		fn.syncRoleModelVignetteHints();
		if (D.dom.llmModelPickerEl) {
			D.state.selectedLlmModel = model;
			D.dom.llmModelPickerEl.value = model;
		}
	};
})(globalThis.DroxChat);
