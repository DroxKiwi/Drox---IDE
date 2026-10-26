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
		const reasoningEffortRaw = D.dom.roleModelPanelReasoningEffortEl?.value.trim() ?? '';
		const reasoningEffort = reasoningEffortRaw === '' ? null : reasoningEffortRaw;
		const thinkingBudget = readPatchNumber(D.dom.roleModelPanelThinkingBudgetEl?.value.trim() ?? '');
		const engineProfileRaw = D.dom.roleModelPanelEngineProfileEl?.value.trim() ?? '';
		const engineProfile = engineProfileRaw === 'local-27b' || engineProfileRaw === 'cloud-full' ? engineProfileRaw : 'local-9b';
		const maxIterationsRaw = readPatchNumber(D.dom.roleModelPanelMaxIterationsEl?.value.trim() ?? '');
		const exploreMaxIterationsRaw = readPatchNumber(D.dom.roleModelPanelExploreMaxIterationsEl?.value.trim() ?? '');
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
		D.state.architectReasoningEffort = reasoningEffort === null ? '' : reasoningEffort;
		assignStateNumber('architectThinkingBudget', thinkingBudget);
		const generalPatch = {};
		D.state.generalSettings = { ...(D.state.generalSettings || {}), engineProfile };
		const gsProfileEl = document.getElementById('general-settings-engine-profile');
		if (gsProfileEl && 'value' in gsProfileEl) {
			gsProfileEl.value = engineProfile;
		}
		if (D.dom.roleModelPanelEngineProfileEl) {
			D.dom.roleModelPanelEngineProfileEl.value = engineProfile;
		}
		generalPatch.engineProfile = engineProfile;
		if (maxIterationsRaw !== undefined && Number.isFinite(maxIterationsRaw)) {
			const cap = D.const.MAX_ITERATIONS_CAP ?? 1000;
			const fallback = D.const.DEFAULT_MAX_ITERATIONS ?? 50;
			const maxIterations = Math.min(cap, Math.max(1, Math.floor(maxIterationsRaw || fallback)));
			D.state.generalSettings = { ...(D.state.generalSettings || {}), maxIterations };
			const gsEl = document.getElementById('general-settings-max-iterations');
			if (gsEl && 'value' in gsEl) {
				gsEl.value = String(maxIterations);
			}
			if (D.dom.roleModelPanelMaxIterationsEl) {
				D.dom.roleModelPanelMaxIterationsEl.value = String(maxIterations);
			}
			generalPatch.maxIterations = maxIterations;
		}
		if (exploreMaxIterationsRaw !== undefined && Number.isFinite(exploreMaxIterationsRaw)) {
			const fallback = D.const.DEFAULT_SUBAGENTS_MAX_ITERATIONS ?? 25;
			const subagentsMaxIterations = Math.max(1, Math.floor(exploreMaxIterationsRaw || fallback));
			D.state.generalSettings = { ...(D.state.generalSettings || {}), subagentsMaxIterations };
			const gsEl = document.getElementById('general-settings-explore-max-iterations');
			if (gsEl && 'value' in gsEl) {
				gsEl.value = String(subagentsMaxIterations);
			}
			if (D.dom.roleModelPanelExploreMaxIterationsEl) {
				D.dom.roleModelPanelExploreMaxIterationsEl.value = String(subagentsMaxIterations);
			}
			generalPatch.subagentsMaxIterations = subagentsMaxIterations;
		}
		if (Object.keys(generalPatch).length > 0) {
			D.vscode.postMessage({ type: 'setGeneralSettings', settings: generalPatch });
			if (typeof fn.syncGeneralSettingsVignetteHint === 'function') {
				fn.syncGeneralSettingsVignetteHint();
			}
		}
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
			reasoningEffort,
			thinkingBudget,
			mutedParams,
		});
		fn.syncRoleModelVignetteHints();
		if (D.dom.llmModelPickerEl) {
			D.state.selectedLlmModel = model;
			D.dom.llmModelPickerEl.value = model;
		}
	};
})(globalThis.DroxChat);
