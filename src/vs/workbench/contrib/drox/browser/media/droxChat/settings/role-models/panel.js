/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

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
		if (showExecutorFields) {
			fn.applyExecutorSameAsArchitectUi();
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
})(globalThis.DroxChat);
