/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

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

	function shortModelLabel(name) {
		const s = String(name || '').trim();
		if (!s) {
			return '—';
		}
		return s.length > 22 ? `${s.slice(0, 20)}…` : s;
	}

	function normalizeExecutorModelSetting(raw) {
		const s = String(raw || '').trim();
		if (!s) {
			return '';
		}
		const first = s.split(',')[0]?.trim() ?? '';
		const head = first.split(';')[0]?.trim() ?? first;
		const at = head.lastIndexOf('@');
		if (at > 0 && at < head.length - 1) {
			const suffix = head.slice(at + 1).trim();
			if (/^\d+$/.test(suffix)) {
				return head.slice(0, at).trim();
			}
		}
		return head;
	}

	fn.syncRoleModelVignetteHints = function() {
		const archHint = document.getElementById('architect-vignette-model-hint');
		const execHint = document.getElementById('executor-vignette-model-hint');
		if (archHint) {
			archHint.textContent = shortModelLabel(D.state.architectModel);
		}
		if (execHint) {
			const exec = normalizeExecutorModelSetting(D.state.executorModel);
			execHint.textContent = exec ? shortModelLabel(exec) : shortModelLabel(D.state.architectModel);
		}
	};

	fn.fillRoleModelPanelSelect = function(role) {
		const select = D.dom.roleModelPanelSelectEl;
		if (!select) {
			return;
		}
		const models = Array.isArray(D.state.llmModels) ? D.state.llmModels : [];
		const current =
			role === 'executor'
				? normalizeExecutorModelSetting(D.state.executorModel)
				: String(D.state.architectModel || '').trim();
		select.innerHTML = '';
		if (role === 'executor') {
			const empty = document.createElement('option');
			empty.value = '';
			empty.textContent = '(same as architect)';
			select.appendChild(empty);
		}
		for (const name of models) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = name;
			if (name === current) {
				opt.selected = true;
			}
			select.appendChild(opt);
		}
		if (current && !models.includes(current)) {
			const extra = document.createElement('option');
			extra.value = current;
			extra.textContent = current;
			extra.selected = true;
			select.insertBefore(extra, select.firstChild);
		}
		select.disabled = D.state.llmModelsLoading || D.state.busy;
	};

	fn.openRoleModelPanel = function(role) {
		const panel = D.dom.roleModelPanelEl;
		const vignette =
			role === 'executor' ? D.dom.executorModelVignetteEl : D.dom.architectModelVignetteEl;
		if (!panel || !vignette) {
			return;
		}
		D.state.rolePanelOpen = role;
		vignette.classList.add('panel-open');
		vignette.setAttribute('aria-expanded', 'true');
		if (D.dom.roleModelPanelTitleEl) {
			D.dom.roleModelPanelTitleEl.textContent =
				role === 'executor' ? 'Executor' : 'Architect';
		}
		panel.classList.toggle('role-model-executor-mode', role === 'executor');
		panel.classList.toggle('role-model-architect-mode', role === 'architect');
		if (D.dom.roleModelPanelExecutorHintEl) {
			D.dom.roleModelPanelExecutorHintEl.hidden = role !== 'executor';
		}
		const showArchitectFields = role === 'architect';
		const showExecutorFields = role === 'executor';
		if (D.dom.roleModelPanelArchitectFieldsEl) {
			D.dom.roleModelPanelArchitectFieldsEl.hidden = !showArchitectFields;
		}
		if (D.dom.roleModelPanelExecutorFieldsEl) {
			D.dom.roleModelPanelExecutorFieldsEl.hidden = !showExecutorFields;
		}
		for (const el of panel.querySelectorAll('.role-model-field-architect-only')) {
			el.hidden = !showArchitectFields;
		}
		for (const el of panel.querySelectorAll('.role-model-field-executor-only')) {
			el.hidden = !showExecutorFields;
		}
		fn.fillRoleModelPanelSelect(role);
		if (showArchitectFields && D.dom.roleModelPanelNumCtxEl) {
			const v = D.state.architectNumCtx;
			D.dom.roleModelPanelNumCtxEl.value = v !== '' && v !== undefined ? String(v) : '';
		}
		if (showArchitectFields && D.dom.roleModelPanelTopPEl) {
			D.dom.roleModelPanelTopPEl.value =
				D.state.architectTopP !== '' && D.state.architectTopP !== undefined
					? String(D.state.architectTopP)
					: '';
		}
		if (showArchitectFields && D.dom.roleModelPanelTopKEl) {
			D.dom.roleModelPanelTopKEl.value =
				D.state.architectTopK !== '' && D.state.architectTopK !== undefined
					? String(D.state.architectTopK)
					: '';
		}
		if (showArchitectFields && D.dom.roleModelPanelRepeatPenaltyEl) {
			D.dom.roleModelPanelRepeatPenaltyEl.value =
				D.state.architectRepeatPenalty !== '' && D.state.architectRepeatPenalty !== undefined
					? String(D.state.architectRepeatPenalty)
					: '';
		}
		if (showArchitectFields && D.dom.roleModelPanelMinPEl) {
			D.dom.roleModelPanelMinPEl.value =
				D.state.architectMinP !== '' && D.state.architectMinP !== undefined
					? String(D.state.architectMinP)
					: '';
		}
		if (showArchitectFields && D.dom.roleModelPanelSeedEl) {
			D.dom.roleModelPanelSeedEl.value =
				D.state.architectSeed !== '' && D.state.architectSeed !== undefined
					? String(D.state.architectSeed)
					: '';
		}
		if (showArchitectFields && D.dom.roleModelPanelTemperatureEl) {
			D.dom.roleModelPanelTemperatureEl.value =
				D.state.architectTemperature !== '' && D.state.architectTemperature !== undefined
					? String(D.state.architectTemperature)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorNumCtxEl) {
			const v = D.state.executorNumCtx;
			D.dom.roleModelPanelExecutorNumCtxEl.value =
				v !== '' && v !== undefined ? String(v) : '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorTopPEl) {
			D.dom.roleModelPanelExecutorTopPEl.value =
				D.state.executorTopP !== '' && D.state.executorTopP !== undefined
					? String(D.state.executorTopP)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorTopKEl) {
			D.dom.roleModelPanelExecutorTopKEl.value =
				D.state.executorTopK !== '' && D.state.executorTopK !== undefined
					? String(D.state.executorTopK)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorRepeatPenaltyEl) {
			D.dom.roleModelPanelExecutorRepeatPenaltyEl.value =
				D.state.executorRepeatPenalty !== '' && D.state.executorRepeatPenalty !== undefined
					? String(D.state.executorRepeatPenalty)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorMinPEl) {
			D.dom.roleModelPanelExecutorMinPEl.value =
				D.state.executorMinP !== '' && D.state.executorMinP !== undefined
					? String(D.state.executorMinP)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorSeedEl) {
			D.dom.roleModelPanelExecutorSeedEl.value =
				D.state.executorSeed !== '' && D.state.executorSeed !== undefined
					? String(D.state.executorSeed)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelExecutorTemperatureEl) {
			D.dom.roleModelPanelExecutorTemperatureEl.value =
				D.state.executorTemperature !== '' && D.state.executorTemperature !== undefined
					? String(D.state.executorTemperature)
					: '';
		}
		if (showExecutorFields && D.dom.roleModelPanelMaxParallelEl) {
			D.dom.roleModelPanelMaxParallelEl.value = String(
				D.state.orchestrationMaxParallelExecutors || 1,
			);
		}
		const rect = vignette.getBoundingClientRect();
		panel.style.left = `${Math.max(8, rect.left - 8)}px`;
		panel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
		panel.hidden = false;
	};

	fn.closeRoleModelPanel = function() {
		const panel = D.dom.roleModelPanelEl;
		if (D.dom.architectModelVignetteEl) {
			D.dom.architectModelVignetteEl.classList.remove('panel-open');
			D.dom.architectModelVignetteEl.setAttribute('aria-expanded', 'false');
		}
		if (D.dom.executorModelVignetteEl) {
			D.dom.executorModelVignetteEl.classList.remove('panel-open');
			D.dom.executorModelVignetteEl.setAttribute('aria-expanded', 'false');
		}
		if (panel) {
			panel.hidden = true;
		}
		D.state.rolePanelOpen = null;
	};

	fn.toggleRoleModelPanel = function(role) {
		if (D.state.rolePanelOpen === role) {
			fn.closeRoleModelPanel();
			return;
		}
		fn.closeRoleModelPanel();
		fn.openRoleModelPanel(role);
	};

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
		} else {
			const executorModel = normalizeExecutorModelSetting(model);
			D.state.executorModel = executorModel;
			D.vscode.postMessage({ type: 'setExecutorModel', model: executorModel });
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
			const maxParallelRaw = D.dom.roleModelPanelMaxParallelEl?.value.trim() ?? '';
			const maxParallel =
				maxParallelRaw === '' ? undefined : Number(maxParallelRaw);
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

	fn.applyRoleModelsFromHost = function(payload) {
		if (typeof payload.architectModel === 'string') {
			D.state.architectModel = payload.architectModel.trim();
		}
		if (typeof payload.executorModel === 'string') {
			D.state.executorModel = normalizeExecutorModelSetting(payload.executorModel);
		}
		if (payload.architectNumCtx !== undefined && payload.architectNumCtx !== null) {
			D.state.architectNumCtx = payload.architectNumCtx;
		}
		if (payload.executorNumCtx !== undefined && payload.executorNumCtx !== null) {
			D.state.executorNumCtx = payload.executorNumCtx;
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
			D.state.executorModel = normalizeExecutorModelSetting(payload.executorModel);
		}
		fn.applyRoleModelsFromHost(payload);
	};

	fn.initRoleModelVignettes = function() {
		if (!D.dom.roleModelVignettesEl) {
			return;
		}
		const onVignetteClick = (role) => {
			return (e) => {
				e.preventDefault();
				e.stopPropagation();
				fn.toggleRoleModelPanel(role);
			};
		};
		if (D.dom.architectModelVignetteEl) {
			D.dom.architectModelVignetteEl.addEventListener('click', onVignetteClick('architect'));
		}
		if (D.dom.executorModelVignetteEl) {
			D.dom.executorModelVignetteEl.addEventListener('click', onVignetteClick('executor'));
		}
		if (D.dom.roleModelPanelCloseEl) {
			D.dom.roleModelPanelCloseEl.addEventListener('click', () => {
				fn.persistRoleModelFromPanel();
				fn.closeRoleModelPanel();
			});
		}
		if (D.dom.roleModelPanelSelectEl) {
			D.dom.roleModelPanelSelectEl.addEventListener('change', () => fn.persistRoleModelFromPanel());
		}
		const architectInputs = [
			D.dom.roleModelPanelNumCtxEl,
			D.dom.roleModelPanelTopPEl,
			D.dom.roleModelPanelTopKEl,
			D.dom.roleModelPanelRepeatPenaltyEl,
			D.dom.roleModelPanelMinPEl,
			D.dom.roleModelPanelSeedEl,
			D.dom.roleModelPanelTemperatureEl,
		];
		for (const el of architectInputs) {
			if (el) {
				el.addEventListener('change', () => fn.persistRoleModelFromPanel());
			}
		}
		const executorInputs = [
			D.dom.roleModelPanelExecutorNumCtxEl,
			D.dom.roleModelPanelExecutorTopPEl,
			D.dom.roleModelPanelExecutorTopKEl,
			D.dom.roleModelPanelExecutorRepeatPenaltyEl,
			D.dom.roleModelPanelExecutorMinPEl,
			D.dom.roleModelPanelExecutorSeedEl,
			D.dom.roleModelPanelExecutorTemperatureEl,
			D.dom.roleModelPanelMaxParallelEl,
		];
		for (const el of executorInputs) {
			if (el) {
				el.addEventListener('change', () => fn.persistRoleModelFromPanel());
			}
		}
		if (D.dom.roleModelPanelReloadEl) {
			D.dom.roleModelPanelReloadEl.addEventListener('click', () => fn.refreshLlmModels());
		}
		document.addEventListener('click', (e) => {
			if (!D.state.rolePanelOpen || !D.dom.roleModelPanelEl) {
				return;
			}
			const t = e.target;
			if (!(t instanceof Node)) {
				return;
			}
			if (D.dom.roleModelPanelEl.contains(t)) {
				return;
			}
			if (D.dom.architectModelVignetteEl?.contains(t)) {
				return;
			}
			if (D.dom.executorModelVignetteEl?.contains(t)) {
				return;
			}
			fn.persistRoleModelFromPanel();
			fn.closeRoleModelPanel();
		});
		fn.syncRoleModelVignetteHints();
	};
})(globalThis.DroxChat);
