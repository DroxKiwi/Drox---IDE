/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	D.dom.logEl = document.getElementById('log');
	D.dom.promptEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'));
	D.dom.refsEl = document.getElementById('refs');
	if (!D.dom.promptEl) {
		throw new Error('Drox: prompt textarea not found');
	}
	D.dom.sendBtn = document.getElementById('send');
	D.dom.sendActionIconSend = D.dom.sendBtn?.querySelector('.composer-action-icon-send');
	D.dom.sendActionIconStop = D.dom.sendBtn?.querySelector('.composer-action-icon-stop');
	D.dom.statusEl = document.getElementById('status');
	D.dom.statTokensIn = document.getElementById('tok-in');
	D.dom.statTokensOut = document.getElementById('tok-out');
	D.dom.statCtx = document.getElementById('ctx');
	D.dom.statCycleEl = document.getElementById('cycle-elapsed');
	D.dom.revertLastRunBtn = document.getElementById('revert-last-run');
	D.dom.progressEl = document.getElementById('progress');
	D.dom.userAskEl = document.getElementById('user-ask');
	D.dom.composerEl = document.getElementById('composer');
	D.dom.pendingPromptsEl = document.getElementById('pending-prompts');
	D.dom.sendQueueBadge = document.getElementById('send-queue-badge');
	D.dom.sessionTabsListEl = document.getElementById('session-tabs-list');
	D.dom.chatBrandEl = document.getElementById('drox-chat-brand');
	D.dom.chatVersionEl = document.getElementById('drox-chat-version');
	D.dom.stickyUserPromptEl = document.getElementById('user-prompt-sticky');
	D.dom.stickyRunObjectiveEl = document.getElementById('run-objective-sticky');
	D.dom.agentActivityStickyEl = document.getElementById('agent-activity-sticky');
	D.dom.attachmentsEl = document.getElementById('attachments');
	D.dom.attachBtn = document.getElementById('attach');
	D.dom.addRefsBtn = document.getElementById('add-refs');
	D.dom.fileInput = document.getElementById('file-input');
	D.dom.exportTranscriptBtn = document.getElementById('export-transcript');
	D.dom.historyToggleBtn = document.getElementById('history-toggle');
	D.dom.historyCloseBtn = document.getElementById('history-close');
	D.dom.historyResetWorkspaceBtn = document.getElementById('history-reset-workspace');
	D.dom.historyPanel = document.getElementById('history-panel');
	D.dom.historyList = document.getElementById('history-list');
	D.dom.newChatBtn = document.getElementById('new-chat');
	D.dom.openSettingsBtn = document.getElementById('open-settings');
	D.dom.agentVignettesEl = document.getElementById('agent-vignettes');
	D.dom.roleModelVignettesEl = document.getElementById('role-model-vignettes');
	D.dom.generalSettingsVignettesEl = document.getElementById('general-settings-vignettes');
	D.dom.generalSettingsVignetteEl = document.getElementById('general-settings-vignette');
	D.dom.generalSettingsPanelEl = document.getElementById('general-settings-panel');
	D.dom.generalSettingsPanelCloseEl = document.getElementById('general-settings-panel-close');
	D.dom.generalSettingsOpenAllEl = document.getElementById('general-settings-open-all');
	D.dom.architectModelVignetteEl = document.getElementById('architect-model-vignette');
	D.dom.executorModelVignetteEl = document.getElementById('executor-model-vignette');
	D.dom.roleModelPanelEl = document.getElementById('role-model-panel');
	D.dom.roleModelPanelTitleEl = document.getElementById('role-model-panel-title');
	D.dom.roleModelPanelCloseEl = document.getElementById('role-model-panel-close');
	D.dom.roleModelPanelSelectEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('role-model-panel-select'));
	D.dom.roleModelPanelArchitectFieldsEl = document.getElementById('role-model-panel-architect-fields');
	D.dom.roleModelPanelExecutorFieldsEl = document.getElementById('role-model-panel-executor-fields');
	D.dom.roleModelPanelNumCtxEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-num-ctx'));
	D.dom.roleModelPanelExecutorNumCtxEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-num-ctx'));
	D.dom.roleModelPanelExecutorTopPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-top-p'));
	D.dom.roleModelPanelExecutorTopKEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-top-k'));
	D.dom.roleModelPanelExecutorRepeatPenaltyEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-repeat-penalty'));
	D.dom.roleModelPanelExecutorMinPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-min-p'));
	D.dom.roleModelPanelExecutorSeedEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-seed'));
	D.dom.roleModelPanelExecutorTemperatureEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-temperature'));
	D.dom.roleModelPanelTopPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-top-p'));
	D.dom.roleModelPanelTopKEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-top-k'));
	D.dom.roleModelPanelRepeatPenaltyEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-repeat-penalty'));
	D.dom.roleModelPanelMinPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-min-p'));
	D.dom.roleModelPanelSeedEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-seed'));
	D.dom.roleModelPanelTemperatureEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-temperature'));
	D.dom.roleModelPanelMaxParallelEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-max-parallel'));
	D.dom.roleModelPanelReloadEl = document.getElementById('role-model-panel-reload');
	D.dom.roleModelPanelExecutorHintEl = document.getElementById('role-model-panel-executor-hint');
	D.dom.roleModelPanelModelRowEl = document.getElementById('role-model-panel-model-row');
	D.dom.roleModelPanelSameAsSummaryEl = document.getElementById('role-model-panel-same-as-summary');
	D.dom.roleModelPanelSameAsSummaryTextEl = document.getElementById('role-model-panel-same-as-summary-text');
	D.dom.roleModelPanelSwitchDedicatedEl = document.getElementById('role-model-panel-switch-dedicated');
	D.dom.llmModelPickerWrapEl = document.getElementById('llm-model-picker-wrap');
	D.dom.llmModelPickerEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('llm-model-picker'));
	D.dom.llmModelReloadBtn = document.getElementById('llm-model-reload');
	D.dom.suggestionsEl = document.getElementById('prompt-suggestions');
})(globalThis.DroxChat);
