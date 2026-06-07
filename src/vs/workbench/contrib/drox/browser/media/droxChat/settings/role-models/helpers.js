/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	function shortModelLabel(name) {
		const s = String(name || '').trim();
		if (!s) {
			return '—';
		}
		return s.length > 22 ? `${s.slice(0, 20)}…` : s;
	}

	fn.executorLlmFieldEls = function() {
		return [
			D.dom.roleModelPanelExecutorNumCtxEl,
			D.dom.roleModelPanelExecutorTopPEl,
			D.dom.roleModelPanelExecutorTopKEl,
			D.dom.roleModelPanelExecutorRepeatPenaltyEl,
			D.dom.roleModelPanelExecutorMinPEl,
			D.dom.roleModelPanelExecutorSeedEl,
			D.dom.roleModelPanelExecutorTemperatureEl,
		];
	};

	fn.isExecutorSameAsArchitect = function() {
		return !fn.normalizeExecutorModelSetting(D.state.executorModel);
	};

	fn.formatRolePanelSameAsSummary = function(architectModel) {
		const arch = String(architectModel || '').trim();
		if (arch) {
			const tpl = D.const.ROLE_PANEL_SAME_AS_SUMMARY_WITH_MODEL;
			return tpl.includes('{0}') ? tpl.replace('{0}', arch) : `${tpl} (${arch})`;
		}
		return D.const.ROLE_PANEL_SAME_AS_SUMMARY_NO_MODEL;
	};

	fn.applyExecutorSameAsArchitectUi = function() {
		const same =
			D.state.rolePanelOpen === 'executor' && fn.isExecutorSameAsArchitect();
		if (D.dom.roleModelPanelEl) {
			D.dom.roleModelPanelEl.classList.toggle('role-model-executor-same-as', same);
		}
		if (D.dom.roleModelPanelSameAsSummaryEl) {
			D.dom.roleModelPanelSameAsSummaryEl.hidden = !same;
		}
		if (D.dom.roleModelPanelSameAsSummaryTextEl && same) {
			D.dom.roleModelPanelSameAsSummaryTextEl.textContent = fn.formatRolePanelSameAsSummary(
				D.state.architectModel,
			);
		}
		if (D.dom.roleModelPanelExecutorHintEl) {
			D.dom.roleModelPanelExecutorHintEl.hidden =
				D.state.rolePanelOpen !== 'executor' || same;
		}
		if (D.dom.roleModelPanelMaxParallelEl) {
			D.dom.roleModelPanelMaxParallelEl.disabled = false;
		}
	};

	fn.revealExecutorDedicatedModelPicker = function() {
		if (D.dom.roleModelPanelModelRowEl) {
			D.dom.roleModelPanelModelRowEl.hidden = false;
		}
		if (D.dom.roleModelPanelSameAsSummaryEl) {
			D.dom.roleModelPanelSameAsSummaryEl.hidden = true;
		}
		if (D.dom.roleModelPanelEl) {
			D.dom.roleModelPanelEl.classList.remove('role-model-executor-same-as');
		}
		if (D.dom.roleModelPanelSelectEl) {
			D.dom.roleModelPanelSelectEl.focus();
		}
	};

	fn.normalizeExecutorModelSetting = function(raw) {
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
			const exec = fn.normalizeExecutorModelSetting(D.state.executorModel);
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
				? fn.normalizeExecutorModelSetting(D.state.executorModel)
				: String(D.state.architectModel || '').trim();
		select.innerHTML = '';
		if (role === 'executor') {
			const empty = document.createElement('option');
			empty.value = '';
			empty.textContent = '(same as architect)';
			if (!current) {
				empty.selected = true;
			}
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
		if (role === 'executor' && !current) {
			select.value = '';
		}
		select.disabled = D.state.llmModelsLoading || D.state.busy;
	};
})(globalThis.DroxChat);
