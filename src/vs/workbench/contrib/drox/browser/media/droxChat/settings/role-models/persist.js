/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.persistRoleModelFromPanel = function() {
		const role = D.state.rolePanelOpen;
		if (!role) {
			return;
		}
		const select = D.dom.roleModelPanelSelectEl;
		const model = select ? select.value.trim() : '';
		if (role === 'architect') {
			D.state.architectModel = model;
			D.vscode.postMessage({ type: 'setArchitectModel', model });
			const numCtxRaw = D.dom.roleModelPanelNumCtxEl?.value.trim() ?? '';
			const numCtx = numCtxRaw === '' ? undefined : Number(numCtxRaw);
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
			if (numCtx !== undefined && Number.isFinite(numCtx)) {
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
			if (fn.isExecutorSameAsArchitect()) {
				if (numCtx !== undefined && Number.isFinite(numCtx)) {
					D.state.executorNumCtx = numCtx;
				}
				D.state.executorTopP = D.state.architectTopP;
				D.state.executorTopK = D.state.architectTopK;
				D.state.executorRepeatPenalty = D.state.architectRepeatPenalty;
				D.state.executorMinP = D.state.architectMinP;
				D.state.executorSeed = D.state.architectSeed;
				D.state.executorTemperature = D.state.architectTemperature;
			}
			D.vscode.postMessage({
				type: 'setArchitectLlmParams',
				numCtx: Number.isFinite(numCtx) ? numCtx : undefined,
				topP: Number.isFinite(topP) ? topP : undefined,
				topK: Number.isFinite(topK) ? topK : undefined,
				repeatPenalty: Number.isFinite(repeatPenalty) ? repeatPenalty : undefined,
				minP: Number.isFinite(minP) ? minP : undefined,
				seed: Number.isFinite(seed) ? seed : undefined,
				temperature: Number.isFinite(temperature) ? temperature : undefined,
			});
			if (fn.isExecutorSameAsArchitect()) {
				fn.applyExecutorSameAsArchitectUi();
			}
		} else {
			const executorModel = fn.normalizeExecutorModelSetting(model);
			const sameAsArchitect = !executorModel;
			D.state.executorModel = executorModel;
			D.vscode.postMessage({ type: 'setExecutorModel', model: executorModel });
			const maxParallelRaw = D.dom.roleModelPanelMaxParallelEl?.value.trim() ?? '';
			const maxParallel =
				maxParallelRaw === '' ? undefined : Number(maxParallelRaw);
			if (!sameAsArchitect) {
				const numCtxRaw = D.dom.roleModelPanelExecutorNumCtxEl?.value.trim() ?? '';
				const numCtx = numCtxRaw === '' ? undefined : Number(numCtxRaw);
				const topPRaw = D.dom.roleModelPanelExecutorTopPEl?.value.trim() ?? '';
				const topP = topPRaw === '' ? undefined : Number(topPRaw);
				const topKRaw = D.dom.roleModelPanelExecutorTopKEl?.value.trim() ?? '';
				const topK = topKRaw === '' ? undefined : Number(topKRaw);
				const repeatPenaltyRaw = D.dom.roleModelPanelExecutorRepeatPenaltyEl?.value.trim() ?? '';
				const repeatPenalty = repeatPenaltyRaw === '' ? undefined : Number(repeatPenaltyRaw);
				const minPRaw = D.dom.roleModelPanelExecutorMinPEl?.value.trim() ?? '';
				const minP = minPRaw === '' ? undefined : Number(minPRaw);
				const seedRaw = D.dom.roleModelPanelExecutorSeedEl?.value.trim() ?? '';
				const seed = seedRaw === '' ? undefined : Number(seedRaw);
				const tempRaw = D.dom.roleModelPanelExecutorTemperatureEl?.value.trim() ?? '';
				const temperature = tempRaw === '' ? undefined : Number(tempRaw);
				if (numCtx !== undefined && Number.isFinite(numCtx)) {
					D.state.executorNumCtx = numCtx;
				}
				if (topP !== undefined && Number.isFinite(topP)) {
					D.state.executorTopP = topP;
				}
				if (topK !== undefined && Number.isFinite(topK)) {
					D.state.executorTopK = topK;
				}
				if (repeatPenalty !== undefined && Number.isFinite(repeatPenalty)) {
					D.state.executorRepeatPenalty = repeatPenalty;
				}
				if (minP !== undefined && Number.isFinite(minP)) {
					D.state.executorMinP = minP;
				}
				if (seed !== undefined && Number.isFinite(seed)) {
					D.state.executorSeed = seed;
				}
				if (temperature !== undefined && Number.isFinite(temperature)) {
					D.state.executorTemperature = temperature;
				}
				D.vscode.postMessage({
					type: 'setExecutorLlmParams',
					numCtx: Number.isFinite(numCtx) ? numCtx : undefined,
					topP: Number.isFinite(topP) ? topP : undefined,
					topK: Number.isFinite(topK) ? topK : undefined,
					repeatPenalty: Number.isFinite(repeatPenalty) ? repeatPenalty : undefined,
					minP: Number.isFinite(minP) ? minP : undefined,
					seed: Number.isFinite(seed) ? seed : undefined,
					temperature: Number.isFinite(temperature) ? temperature : undefined,
				});
			}
			fn.applyExecutorSameAsArchitectUi();
			if (maxParallel !== undefined && Number.isFinite(maxParallel)) {
				const cap = D.const.MAX_PARALLEL_EXECUTORS_CAP ?? 100;
				const v = Math.min(cap, Math.max(1, Math.floor(maxParallel)));
				D.state.orchestrationMaxParallelExecutors = v;
				if (D.dom.roleModelPanelMaxParallelEl) {
					D.dom.roleModelPanelMaxParallelEl.value = String(v);
				}
				D.vscode.postMessage({
					type: 'setOrchestrationMaxParallelExecutors',
					value: v,
				});
			}
		}
		fn.syncRoleModelVignetteHints();
		if (role === 'architect' && D.dom.llmModelPickerEl) {
			D.state.selectedLlmModel = model;
			D.dom.llmModelPickerEl.value = model;
		}
	};
})(globalThis.DroxChat);
