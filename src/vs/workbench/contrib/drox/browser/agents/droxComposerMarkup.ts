/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { DROX_NUM_CTX_CHOICES, DROX_NUM_CTX_CUSTOM_SELECT, DROX_NUM_CTX_MAX, DROX_NUM_CTX_MIN, formatDroxNumCtxLabel } from '../../common/droxNumCtx.js';

/** Panneaux flottants Settings / Architecte / wizard — mêmes ids que le webview Drox Chat. */
export function buildDroxComposerPanelsMarkup(): string {
	const rolePanelModelLabel = localize('droxChatRolePanelModel', 'Model');
	const rolePanelNumCtxLabel = localize('droxChatRolePanelNumCtx', 'Context window');
	const rolePanelNumCtxCustomLabel = localize('droxChatRolePanelNumCtxCustom', 'Custom');
	const rolePanelTopPLabel = localize('droxChatRolePanelTopP', 'Top P');
	const rolePanelTopKLabel = localize('droxChatRolePanelTopK', 'Top K');
	const rolePanelRepeatPenaltyLabel = localize('droxChatRolePanelRepeatPenalty', 'Repeat penalty');
	const rolePanelMinPLabel = localize('droxChatRolePanelMinP', 'Min P');
	const rolePanelSeedLabel = localize('droxChatRolePanelSeed', 'Seed');
	const rolePanelTempLabel = localize('droxChatRolePanelTemperature', 'Temperature');
	const rolePanelSectionSampling = localize('droxChatRolePanelSectionSampling', 'Sampling');
	const rolePanelSectionOutput = localize('droxChatRolePanelSectionOutput', 'Output');
	const rolePanelPresencePenaltyLabel = localize('droxChatRolePanelPresencePenalty', 'Presence penalty');
	const rolePanelFrequencyPenaltyLabel = localize('droxChatRolePanelFrequencyPenalty', 'Frequency penalty');
	const rolePanelMaxTokensLabel = localize('droxChatRolePanelMaxTokens', 'Max tokens');
	const rolePanelKeepAliveLabel = localize('droxChatRolePanelKeepAlive', 'Keep alive');
	const rolePanelSectionThinking = localize('droxChatRolePanelSectionThinking', 'Thinking');
	const rolePanelReasoningEffortLabel = localize('droxChatRolePanelReasoningEffort', 'Reasoning effort');
	const rolePanelThinkingBudgetLabel = localize('droxChatRolePanelThinkingBudget', 'Thinking budget');
	const rolePanelReasoningEffortUnset = localize('droxChatRolePanelReasoningEffortUnset', '— (server default)');
	const rolePanelReasoningEffortLow = localize('droxChatRolePanelReasoningEffortLow', 'Low');
	const rolePanelReasoningEffortMedium = localize('droxChatRolePanelReasoningEffortMedium', 'Medium');
	const rolePanelReasoningEffortHigh = localize('droxChatRolePanelReasoningEffortHigh', 'High');
	const rolePanelReasoningEffortXHigh = localize('droxChatRolePanelReasoningEffortXHigh', 'Extra high');
	const rolePanelReloadLabel = localize('droxChatRolePanelReload', 'Reload models');
	const rolePanelApplyLabel = localize('droxChatRolePanelClose', 'Close');
	const rolePanelMuteOnTitle = localize('droxChatRolePanelMuteOn', 'Hidden from backend — click to send this parameter');
	const rolePanelMuteOffTitle = localize('droxChatRolePanelMuteOff', 'Sent to backend — click to hide this parameter');
	const generalSettingsPanelTitle = localize('droxChatGeneralSettingsPanelTitle', 'General settings');

	const muteableField = (paramKey: string, label: string, inputHtml: string): string => `
			<label class="role-model-field" data-llm-param="${paramKey}">
				<span class="role-model-field-label">${label}</span>
				<span class="role-model-field-input-row">
					${inputHtml}
					<button type="button" class="role-model-param-mute-btn" data-llm-param="${paramKey}" aria-pressed="false" title="${rolePanelMuteOffTitle}" aria-label="${rolePanelMuteOffTitle}" data-title-live="${rolePanelMuteOffTitle}" data-title-muted="${rolePanelMuteOnTitle}"><span class="codicon codicon-eye" aria-hidden="true"></span></button>
				</span>
			</label>`;
	const generalSettingsSectionConnection = localize('droxChatGeneralSettingsSectionConnection', 'Connection');
	const generalSettingsConnectIa = localize('droxChatGeneralSettingsConnectIa', 'Connect your AI');
	const generalSettingsConnectionNotConfigured = localize('droxChatGeneralSettingsConnectionNotConfigured', 'Not configured');
	const generalSettingsSectionAgent = localize('droxChatGeneralSettingsSectionAgent', 'Agent');
	const generalSettingsSectionBehavior = localize('droxChatGeneralSettingsSectionBehavior', 'Behavior');
	const generalSettingsMaxIterations = localize('droxChatGeneralSettingsMaxIterations', 'Max iterations');
	const generalSettingsNativeThinking = localize('droxChatGeneralSettingsNativeThinking', 'Native thinking');
	const generalSettingsPrimaryLanguage = localize('droxChatGeneralSettingsPrimaryLanguage', 'Primary language');
	const generalSettingsWarmStart = localize('droxChatGeneralSettingsWarmStart', 'Warm start');
	const generalSettingsConfirmFileWrites = localize('droxChatGeneralSettingsConfirmFileWrites', 'Confirm file writes');
	const generalSettingsOpenModifiedFiles = localize('droxChatGeneralSettingsOpenModifiedFiles', 'Open modified files');
	const generalSettingsAddDiagnosticOnHover = localize('droxChatGeneralSettingsAddDiagnosticOnHover', 'Diagnostic on hover');
	const generalSettingsMcpToolsEnabled = localize('droxChatGeneralSettingsMcpToolsEnabled', 'MCP tools enabled');
	const generalSettingsShowChatErrorsAndWarnings = localize('droxChatGeneralSettingsShowChatErrorsAndWarnings', 'Show errors and warnings');
	const generalSettingsOpenAll = localize('droxChatGeneralSettingsOpenAll', 'Open all Drox settings…');
	const generalSettingsPanelClose = localize('droxChatGeneralSettingsPanelClose', 'Close');

	const numCtxOptions = DROX_NUM_CTX_CHOICES.map(v =>
		`<option value="${v}">${formatDroxNumCtxLabel(v)}</option>`,
	).join('');

	return `<div id="drox-agents-composer-panels-root" class="drox-agents-composer-panels-root">
		<div id="role-model-panel" class="role-model-panel" hidden role="dialog" aria-modal="false">
			<div class="role-model-panel-head">
				<strong id="role-model-panel-title"></strong>
				<button type="button" id="role-model-panel-close" class="icon-btn role-model-panel-close" aria-label="${rolePanelApplyLabel}">×</button>
			</div>
			<label class="role-model-field role-model-panel-model-field">
				<span>${rolePanelModelLabel}</span>
				<select id="role-model-panel-select" class="role-model-panel-select"></select>
			</label>
			${muteableField('numCtx', rolePanelNumCtxLabel, `<div class="role-model-num-ctx-row">
					<select id="role-model-panel-num-ctx" class="role-model-panel-select">
						${numCtxOptions}
						<option value="${DROX_NUM_CTX_CUSTOM_SELECT}">${rolePanelNumCtxCustomLabel}</option>
					</select>
					<input type="number" id="role-model-panel-num-ctx-custom" class="role-model-panel-input role-model-num-ctx-custom" hidden min="${DROX_NUM_CTX_MIN}" max="${DROX_NUM_CTX_MAX}" step="1024" />
				</div>`)}
			<p class="role-model-panel-section-label">${rolePanelSectionSampling}</p>
			${muteableField('temperature', rolePanelTempLabel, `<input type="number" id="role-model-panel-temperature" class="role-model-panel-input" min="0" max="2" step="0.1" placeholder="—" />`)}
			${muteableField('topP', rolePanelTopPLabel, `<input type="number" id="role-model-panel-top-p" class="role-model-panel-input" min="0" max="1" step="0.05" placeholder="—" />`)}
			${muteableField('repeatPenalty', rolePanelRepeatPenaltyLabel, `<input type="number" id="role-model-panel-repeat-penalty" class="role-model-panel-input" min="0" max="3" step="0.05" placeholder="—" />`)}
			${muteableField('minP', rolePanelMinPLabel, `<input type="number" id="role-model-panel-min-p" class="role-model-panel-input" min="0" max="1" step="0.01" placeholder="—" />`)}
			${muteableField('topK', rolePanelTopKLabel, `<input type="number" id="role-model-panel-top-k" class="role-model-panel-input" min="1" max="1000" step="1" placeholder="—" />`)}
			${muteableField('seed', rolePanelSeedLabel, `<input type="number" id="role-model-panel-seed" class="role-model-panel-input" step="1" placeholder="—" />`)}
			${muteableField('presencePenalty', rolePanelPresencePenaltyLabel, `<input type="number" id="role-model-panel-presence-penalty" class="role-model-panel-input" min="-2" max="2" step="0.05" placeholder="—" />`)}
			${muteableField('frequencyPenalty', rolePanelFrequencyPenaltyLabel, `<input type="number" id="role-model-panel-frequency-penalty" class="role-model-panel-input" min="-2" max="2" step="0.05" placeholder="—" />`)}
			<p class="role-model-panel-section-label">${rolePanelSectionThinking}</p>
			${muteableField('reasoningEffort', rolePanelReasoningEffortLabel, `<select id="role-model-panel-reasoning-effort" class="role-model-panel-select">
					<option value="">${rolePanelReasoningEffortUnset}</option>
					<option value="low">${rolePanelReasoningEffortLow}</option>
					<option value="medium">${rolePanelReasoningEffortMedium}</option>
					<option value="high">${rolePanelReasoningEffortHigh}</option>
					<option value="xhigh">${rolePanelReasoningEffortXHigh}</option>
				</select>`)}
			${muteableField('thinkingBudget', rolePanelThinkingBudgetLabel, `<input type="number" id="role-model-panel-thinking-budget" class="role-model-panel-input" min="1" step="1" placeholder="—" />`)}
			<p class="role-model-panel-section-label">${rolePanelSectionOutput}</p>
			${muteableField('maxTokens', rolePanelMaxTokensLabel, `<input type="number" id="role-model-panel-max-tokens" class="role-model-panel-input" min="1" step="1" placeholder="—" />`)}
			${muteableField('keepAlive', rolePanelKeepAliveLabel, `<input type="text" id="role-model-panel-keep-alive" class="role-model-panel-input" spellcheck="false" placeholder="30m" />`)}
			<div class="role-model-panel-actions">
				<button type="button" id="role-model-panel-reload" class="role-model-panel-btn">${rolePanelReloadLabel}</button>
			</div>
		</div>
		<div id="general-settings-panel" class="general-settings-panel" hidden role="dialog" aria-modal="false">
			<div class="general-settings-panel-head">
				<strong>${generalSettingsPanelTitle}</strong>
				<button type="button" id="general-settings-panel-close" class="icon-btn general-settings-panel-close" aria-label="${generalSettingsPanelClose}">×</button>
			</div>
			<p class="general-settings-section-label">${generalSettingsSectionConnection}</p>
			<div class="general-settings-connection">
				<p id="general-settings-connection-summary" class="general-settings-connection-summary">${generalSettingsConnectionNotConfigured}</p>
				<button type="button" id="general-settings-connect-ia" class="general-settings-panel-btn general-settings-connect-btn">${generalSettingsConnectIa}</button>
			</div>
			<p class="general-settings-section-label">${generalSettingsSectionAgent}</p>
			<label class="general-settings-field"><span>${generalSettingsMaxIterations}</span><input type="number" id="general-settings-max-iterations" class="general-settings-input" min="1" max="200" step="1" /></label>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-native-thinking" /><span>${generalSettingsNativeThinking}</span></label>
			<label class="general-settings-field"><span>${generalSettingsPrimaryLanguage}</span><input type="text" id="general-settings-primary-language" class="general-settings-input" spellcheck="false" /></label>
			<p class="general-settings-section-label">${generalSettingsSectionBehavior}</p>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-warm-start" checked /><span>${generalSettingsWarmStart}</span></label>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-confirm-file-writes" /><span>${generalSettingsConfirmFileWrites}</span></label>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-open-modified-files" checked /><span>${generalSettingsOpenModifiedFiles}</span></label>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-add-diagnostic-on-hover" /><span>${generalSettingsAddDiagnosticOnHover}</span></label>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-mcp-tools-enabled" checked /><span>${generalSettingsMcpToolsEnabled}</span></label>
			<label class="general-settings-field general-settings-field-check"><input type="checkbox" id="general-settings-show-chat-errors-warnings" checked /><span>${generalSettingsShowChatErrorsAndWarnings}</span></label>
			<div class="general-settings-panel-actions">
				<button type="button" id="general-settings-open-all" class="general-settings-panel-btn">${generalSettingsOpenAll}</button>
			</div>
		</div>
		<div id="drox-connection-wizard" class="drox-connection-wizard" hidden role="dialog" aria-modal="true" aria-labelledby="drox-connection-wizard-title">
			<div class="drox-connection-wizard-backdrop"></div>
			<div class="drox-connection-wizard-card">
				<div class="drox-connection-wizard-head">
					<div>
						<p id="drox-connection-wizard-step-label" class="drox-connection-wizard-step-label">Step 1 / 3</p>
						<strong id="drox-connection-wizard-title">${generalSettingsConnectIa}</strong>
					</div>
					<button type="button" id="drox-connection-wizard-cancel" class="icon-btn" aria-label="${generalSettingsPanelClose}">×</button>
				</div>
				<div id="drox-connection-wizard-body" class="drox-connection-wizard-body"></div>
				<div class="drox-connection-wizard-actions">
					<span class="drox-connection-wizard-actions-spacer"></span>
					<button type="button" id="drox-connection-wizard-back" class="general-settings-panel-btn" hidden>Back</button>
					<button type="button" id="drox-connection-wizard-next" class="general-settings-panel-btn">Next</button>
					<button type="button" id="drox-connection-wizard-finish" class="general-settings-panel-btn drox-wizard-primary" hidden>Test and save</button>
				</div>
			</div>
		</div>
	</div>`;
}
