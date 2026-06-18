/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.setArchitectNumCtxCustomVisible = function (visible) {
		const custom = D.dom.roleModelPanelNumCtxCustomEl;
		if (!custom) {
			return;
		}
		custom.hidden = !visible;
	};

	fn.syncArchitectNumCtxPanelFromState = function () {
		const select = D.dom.roleModelPanelNumCtxEl;
		const custom = D.dom.roleModelPanelNumCtxCustomEl;
		if (!select) {
			return;
		}
		const raw = D.state.architectNumCtx;
		const value = raw !== '' && raw !== undefined
			? D.fn.clampArchitectNumCtx(raw)
			: D.const.ARCHITECT_NUM_CTX_DEFAULT;
		if (D.fn.isArchitectNumCtxPreset(value)) {
			select.value = String(value);
			fn.setArchitectNumCtxCustomVisible(false);
		} else {
			select.value = D.const.ARCHITECT_NUM_CTX_CUSTOM;
			if (custom) {
				custom.value = String(value);
			}
			fn.setArchitectNumCtxCustomVisible(true);
		}
	};

	fn.onArchitectNumCtxPresetChange = function () {
		const select = D.dom.roleModelPanelNumCtxEl;
		if (!select) {
			return;
		}
		const isCustom = select.value === D.const.ARCHITECT_NUM_CTX_CUSTOM;
		fn.setArchitectNumCtxCustomVisible(isCustom);
		if (isCustom && D.dom.roleModelPanelNumCtxCustomEl) {
			const current = D.state.architectNumCtx;
			if (current !== '' && current !== undefined && !D.fn.isArchitectNumCtxPreset(current)) {
				D.dom.roleModelPanelNumCtxCustomEl.value = String(D.fn.clampArchitectNumCtx(current));
			} else if (!D.dom.roleModelPanelNumCtxCustomEl.value.trim()) {
				D.dom.roleModelPanelNumCtxCustomEl.value = String(D.const.ARCHITECT_NUM_CTX_DEFAULT);
			}
			D.dom.roleModelPanelNumCtxCustomEl.focus();
		}
	};

	fn.readArchitectNumCtxFromPanel = function () {
		const select = D.dom.roleModelPanelNumCtxEl;
		if (!select) {
			return undefined;
		}
		if (select.value === D.const.ARCHITECT_NUM_CTX_CUSTOM) {
			const raw = D.dom.roleModelPanelNumCtxCustomEl?.value.trim() ?? '';
			if (raw === '') {
				return undefined;
			}
			const n = Number(raw);
			if (!Number.isFinite(n)) {
				return undefined;
			}
			return D.fn.clampArchitectNumCtx(n);
		}
		const preset = Number(select.value);
		if (!Number.isFinite(preset)) {
			return undefined;
		}
		return D.fn.clampArchitectNumCtx(preset);
	};
})(globalThis.DroxChat);
