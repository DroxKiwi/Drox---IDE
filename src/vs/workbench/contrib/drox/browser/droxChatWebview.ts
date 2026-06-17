/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';

import { localize } from '../../../../nls.js';

import { webviewGenericCspSource } from '../../webview/common/webview.js';
import { DROX_NUM_CTX_CHOICES, formatDroxNumCtxLabel } from '../common/droxNumCtx.js';



/** Chat webview scripts (order matters — see `droxChat/README.md`). */
export const DROX_CHAT_SCRIPT_FILES = [
	'droxChat/core/00-bootstrap.js',
	'droxChat/core/dom.js',
	'droxChat/core/constants-modes.js',
	'droxChat/core/constants-num-ctx.js',
	'droxChat/core/state.js',
	'droxChat/core/warmup-phrases.js',
	'droxChat/core/constants-meta.js',
	'droxChat/settings/01-prompt.js',
	'droxChat/settings/01b-models.js',
	'droxChat/settings/role-models/state.js',
	'droxChat/settings/role-models/helpers.js',
	'droxChat/settings/role-models/panel.js',
	'droxChat/settings/role-models/persist.js',
	'droxChat/settings/role-models/host-sync.js',
	'droxChat/settings/role-models/init.js',
	'droxChat/settings/general-settings/state.js',
	'droxChat/settings/general-settings/chat-issues.js',
	'droxChat/settings/general-settings/helpers.js',
	'droxChat/settings/general-settings/panel.js',
	'droxChat/settings/general-settings/host-sync.js',
	'droxChat/settings/general-settings/init.js',
	'droxChat/chrome/util.js',
	'droxChat/chrome/composer-chrome.js',
	'droxChat/chrome/phase-labels.js',
	'droxChat/chrome/architect-tail.js',
	'droxChat/chrome/busy.js',
	'droxChat/chrome/activity.js',
	'droxChat/chrome/todos.js',
	'droxChat/composer/pending.js',
	'droxChat/composer/helpers.js',
	'droxChat/composer/refs.js',
	'droxChat/composer/path-complete.js',
	'droxChat/composer/payload.js',
	'droxChat/composer/send.js',
	'droxChat/composer/03b-userPromptSticky.js',
	'droxChat/session/04-history.js',
	'droxChat/session/lazy-history.js',
	'droxChat/attachments/05-attachments.js',
	'droxChat/user-ask/06-userAsk.js',
	'droxChat/markdown/11-markdown.js',
	'droxChat/stream/log/00-constants.js',
	'droxChat/stream/discussion/state.js',
	'droxChat/stream/display/simple.js',
	'droxChat/stream/answer/helpers.js',
	'droxChat/stream/answer/presentation.js',
	'droxChat/stream/messages/viewer.js',
	'droxChat/stream/messages/scroll.js',
	'droxChat/stream/messages/user.js',
	'droxChat/stream/messages/orchestration.js',
	'droxChat/stream/answer/stream.js',
	'droxChat/stream/tools/logTools.js',
	'droxChat/stream/timeline/strip.js',
	'droxChat/stream/timeline/thinking.js',
	'droxChat/stream/timeline/phases.js',
	'droxChat/stream/timeline/run-rail-stations.js',
	'droxChat/stream/timeline/mount.js',
	'droxChat/stream/timeline/overrides.js',
	'droxChat/tools/13-collapsibleTray.js',
	'droxChat/tools/12-fileChange.js',
	'droxChat/session/08-tabs.js',
	'droxChat/bridge/tool-events.js',
	'droxChat/bridge/abort.js',
	'droxChat/bridge/send-button.js',
	'droxChat/bridge/host-message.js',
	'droxChat/bridge/10-bootstrap.js',
] as const;

export function getDroxChatHtml(
	cssUri: URI,
	scriptUris: readonly URI[],
	versionLabel: string,
	versionTitle: string,
	showExportTranscript = true,
	showAdvancedSettings = true,
): string {

	const css = cssUri.toString(true);

	const scriptTags = scriptUris
		.map((u) => `\t<script src="${u.toString(true)}"></script>`)
		.join('\n');

	const title = localize('droxChatTitle', 'Drox');

	const sendLabel = localize('droxChatSend', 'Send');

	const attachLabel = localize('droxChatAttach', 'Attach image');

	const placeholder = localize('droxChatPlaceholder', 'Ask Drox… (drop files here · @ path · /help · Enter to send)');

	const ready = localize('droxChatReady', 'Ready');

	const historyLabel = localize('droxChatHistory', 'Sessions');
	const exportTranscriptLabel = localize('droxChatExportTranscript', 'Export discussion (dev — fichier complet + latest-transcript.txt)');
	const resetWorkspaceLabel = localize(
		'droxChatResetWorkspace',
		'Réinitialiser les données Drox du workspace…',
	);

	const newChatLabel = localize('droxChatNew', 'New chat');

	const settingsLabel = localize('droxChatSettings', 'Drox settings');

	const addRefsLabel = localize('droxChatAddRefs', 'Add file/folder references');

	const pathSuggestionsLabel = localize('droxChatPathSuggestions', 'Path completion');

	const modePickerLabel = localize('droxChatPermissionMode', 'Request mode');
	const modeAnalyzeName = localize('droxChatModeAnalyzeName', 'Analyze');
	const modeAnalyzeDesc = localize(
		'droxChatModeAnalyzeDesc',
		'Read and explore freely. Writes only under `.drox/` (analyses and memory).',
	);
	const modeTrustEditName = localize('droxChatModeTrustEditName', 'Trust Edit');
	const modeTrustEditDesc = localize(
		'droxChatModeTrustEditDesc',
		'Full agent: read and edit the project without confirmation prompts.',
	);
	const modeImNotCrazyName = localize('droxChatModeImNotCrazyName', "I'm Not Crazy");
	const modeImNotCrazyDesc = localize(
		'droxChatModeImNotCrazyDesc',
		'Free reading. Each file edit or write requires your confirmation.',
	);

	const architectVignetteName = localize('droxChatArchitectVignetteName', 'Architect');
	const architectVignetteDesc = localize('droxChatArchitectVignetteDescSolo', 'Agent model — click to configure');
	const roleModelsPickerLabel = localize('droxChatArchitectModelPicker', 'Architect model');
	const bodyClass = 'drox-architect-solo-ui';
	const rolePanelModelLabel = localize('droxChatRolePanelModel', 'Model');
	const rolePanelNumCtxLabel = localize('droxChatRolePanelNumCtx', 'Context window');
	const rolePanelTopPLabel = localize('droxChatRolePanelTopP', 'Top P');
	const rolePanelTopKLabel = localize('droxChatRolePanelTopK', 'Top K');
	const rolePanelRepeatPenaltyLabel = localize('droxChatRolePanelRepeatPenalty', 'Repeat penalty');
	const rolePanelMinPLabel = localize('droxChatRolePanelMinP', 'Min P');
	const rolePanelSeedLabel = localize('droxChatRolePanelSeed', 'Seed');
	const rolePanelTempLabel = localize('droxChatRolePanelTemperature', 'Temperature');
	const rolePanelReloadLabel = localize('droxChatRolePanelReload', 'Reload models');
	const rolePanelApplyLabel = localize('droxChatRolePanelClose', 'Close');

	const generalSettingsVignetteName = localize('droxChatGeneralSettingsVignetteName', 'Settings');
	const generalSettingsVignetteDesc = localize('droxChatGeneralSettingsVignetteDesc', 'General Drox options');
	const generalSettingsPickerLabel = localize('droxChatGeneralSettingsPicker', 'General settings');
	const generalSettingsPanelTitle = localize('droxChatGeneralSettingsPanelTitle', 'General settings');
	const generalSettingsSectionConnection = localize('droxChatGeneralSettingsSectionConnection', 'Connection');
	const generalSettingsSectionAgent = localize('droxChatGeneralSettingsSectionAgent', 'Agent');
	const generalSettingsSectionBehavior = localize('droxChatGeneralSettingsSectionBehavior', 'Behavior');
	const generalSettingsLlmProvider = localize('droxChatGeneralSettingsLlmProvider', 'LLM provider');
	const generalSettingsServer = localize('droxChatGeneralSettingsServer', 'Server URL');
	const generalSettingsApiKey = localize('droxChatGeneralSettingsApiKey', 'API key');
	const generalSettingsKeepAlive = localize('droxChatGeneralSettingsKeepAlive', 'Keep alive');
	const generalSettingsMaxIterations = localize('droxChatGeneralSettingsMaxIterations', 'Max iterations');
	const generalSettingsNativeThinking = localize('droxChatGeneralSettingsNativeThinking', 'Native thinking');
	const generalSettingsPrimaryLanguage = localize('droxChatGeneralSettingsPrimaryLanguage', 'Primary language');
	const generalSettingsMaxTokens = localize('droxChatGeneralSettingsMaxTokens', 'Max tokens');
	const generalSettingsNumPredict = localize('droxChatGeneralSettingsNumPredict', 'Num predict');
	const generalSettingsWarmStart = localize('droxChatGeneralSettingsWarmStart', 'Warm start');
	const generalSettingsConfirmFileWrites = localize('droxChatGeneralSettingsConfirmFileWrites', 'Confirm file writes');
	const generalSettingsOpenModifiedFiles = localize('droxChatGeneralSettingsOpenModifiedFiles', 'Open modified files');
	const generalSettingsAddDiagnosticOnHover = localize('droxChatGeneralSettingsAddDiagnosticOnHover', 'Diagnostic on hover');
	const generalSettingsMcpToolsEnabled = localize('droxChatGeneralSettingsMcpToolsEnabled', 'MCP tools enabled');
	const generalSettingsShowChatErrorsAndWarnings = localize('droxChatGeneralSettingsShowChatErrorsAndWarnings', 'Show errors and warnings');
	const generalSettingsOpenAll = localize('droxChatGeneralSettingsOpenAll', 'Open all Drox settings…');
	const generalSettingsPanelClose = localize('droxChatGeneralSettingsPanelClose', 'Close');

	const modelReloadLabel = localize('droxChatModelReload', 'Reload model list from server');

	const droxIcon = (body: string) =>
		`<svg class="drox-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
	const iconAdd = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" d="M8 3v10M3 8h10"/>');
	const iconGear = droxIcon('<circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.15"/><path fill="currentColor" d="M8 1.2v2.3M8 12.5v2.3M1.2 8h2.3M12.5 8h2.3M3.2 3.2l1.6 1.6M11.2 11.2l1.6 1.6M3.2 12.8l1.6-1.6M11.2 4.8l1.6-1.6"/>');
	const iconFolder = droxIcon('<path fill="currentColor" d="M2.5 4.2h4.9l1.3 2H13.2v7.3H2.5V4.2z"/>');
	const iconAttach = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" d="M6.2 8.8l2.8-2.8a2 2 0 113 3L6.5 11.5a3 3 0 11-4.2-4.2l3.8-3.8"/>');
	const iconClose = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" d="M4.2 4.2l7.6 7.6M11.8 4.2 4.2 11.8"/>');
	const iconHistory = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" d="M2.5 8a5.5 5.5 0 1 0 1.2-3.4M2.5 4.5V8h3.5"/>');
	const iconExport = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" d="M4.5 2.5h7v9h-7zM6 11.5h4M8 11.5V14M5.5 5.5h5M5.5 7.5h5M5.5 9.5h3"/>');
	const iconReload = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" d="M8 2.5v2M8 2.5A5.5 5.5 0 1 0 3.2 11.8M3.2 11.8v-2.2M3.2 11.8h2.2"/>');
	const iconSend = droxIcon('<path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="M8 11V4.5M8 4.5 5.25 7.25 8 4.5l2.75 2.75"/>');
	const iconStop = droxIcon('<rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor"/>');

	const devKeepAliveField = showAdvancedSettings ? `
			<label class="general-settings-field">

				<span>${generalSettingsKeepAlive}</span>

				<input type="text" id="general-settings-keep-alive" class="general-settings-input" spellcheck="false" />

			</label>
` : '';

	const devAgentSectionLabel = showAdvancedSettings ? `
			<p class="general-settings-section-label">${generalSettingsSectionAgent}</p>
` : '';

	const devAgentFields = showAdvancedSettings ? `
			<label class="general-settings-field">

				<span>${generalSettingsMaxIterations}</span>

				<input type="number" id="general-settings-max-iterations" class="general-settings-input" min="1" max="200" step="1" />

			</label>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-native-thinking" />

				<span>${generalSettingsNativeThinking}</span>

			</label>

			<label class="general-settings-field">

				<span>${generalSettingsPrimaryLanguage}</span>

				<input type="text" id="general-settings-primary-language" class="general-settings-input" spellcheck="false" />

			</label>

			<label class="general-settings-field">

				<span>${generalSettingsMaxTokens}</span>

				<input type="number" id="general-settings-max-tokens" class="general-settings-input" min="1" step="1" placeholder="—" />

			</label>

			<label class="general-settings-field">

				<span>${generalSettingsNumPredict}</span>

				<input type="number" id="general-settings-num-predict" class="general-settings-input" min="1" step="1" placeholder="—" />

			</label>
` : `
			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-native-thinking" />

				<span>${generalSettingsNativeThinking}</span>

			</label>

			<label class="general-settings-field">

				<span>${generalSettingsPrimaryLanguage}</span>

				<input type="text" id="general-settings-primary-language" class="general-settings-input" spellcheck="false" />

			</label>
`;

	const architectContextField = `
			<label class="role-model-field">

				<span>${rolePanelNumCtxLabel}</span>

				<select id="role-model-panel-num-ctx" class="role-model-panel-select">
${DROX_NUM_CTX_CHOICES.map(v => `\t\t\t\t\t<option value="${v}">${formatDroxNumCtxLabel(v)}</option>`).join('\n')}
				</select>

			</label>
`;

	const devRoleModelAdvancedFields = showAdvancedSettings ? `
			<label class="role-model-field">

				<span>${rolePanelTopPLabel}</span>

				<input type="number" id="role-model-panel-top-p" class="role-model-panel-input" min="0" max="1" step="0.05" />

			</label>

			<label class="role-model-field">

				<span>${rolePanelTopKLabel}</span>

				<input type="number" id="role-model-panel-top-k" class="role-model-panel-input" min="1" max="1000" step="1" />

			</label>

			<label class="role-model-field">

				<span>${rolePanelRepeatPenaltyLabel}</span>

				<input type="number" id="role-model-panel-repeat-penalty" class="role-model-panel-input" min="0" max="3" step="0.05" />

			</label>

			<label class="role-model-field">

				<span>${rolePanelMinPLabel}</span>

				<input type="number" id="role-model-panel-min-p" class="role-model-panel-input" min="0" max="1" step="0.01" />

			</label>

			<label class="role-model-field">

				<span>${rolePanelSeedLabel}</span>

				<input type="number" id="role-model-panel-seed" class="role-model-panel-input" step="1" />

			</label>

			<label class="role-model-field">

				<span>${rolePanelTempLabel}</span>

				<input type="number" id="role-model-panel-temperature" class="role-model-panel-input" min="0" max="2" step="0.1" />

			</label>
` : '';

	return `<!DOCTYPE html>

<html lang="en">

<head>

	<meta charset="UTF-8" />

	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: ${webviewGenericCspSource}; style-src ${webviewGenericCspSource} 'unsafe-inline'; script-src ${webviewGenericCspSource};" />

	<meta name="viewport" content="width=device-width, initial-scale=1.0" />

	<title>${title}</title>

	<link rel="stylesheet" href="${css}" />

</head>

<body class="${bodyClass}">

	<div id="progress"></div>

	<header id="chat-chrome" class="chat-chrome">

		<div id="session-tab-bar" class="session-tab-bar">

			<div id="drox-chat-brand" class="drox-chat-brand" title="${versionTitle}">

				<span class="drox-chat-brand-name">DROX</span>

				<span id="drox-chat-version" class="drox-chat-brand-version">${versionLabel}</span>

			</div>

			<div id="session-tabs-list" class="session-tabs-list" role="tablist" aria-label="${title}"></div>

			<div class="session-tab-actions">

				${showExportTranscript ? `<button type="button" id="export-transcript" class="icon-btn" title="${exportTranscriptLabel}" aria-label="${exportTranscriptLabel}">${iconExport}</button>` : ''}

				<button type="button" id="history-toggle" class="icon-btn" title="${historyLabel}" aria-label="${historyLabel}">${iconHistory}</button>

				<button type="button" id="new-chat" class="icon-btn" title="${newChatLabel}" aria-label="${newChatLabel}">${iconAdd}</button>

			</div>

		</div>

		<div id="user-prompt-sticky" class="user-prompt-sticky" hidden role="button" tabindex="0" aria-label="Last user message"></div>

		<div id="chat-chrome-sticky-stack" class="chat-chrome-sticky-stack" aria-hidden="false">

			<div id="run-objective-sticky" class="run-objective-sticky" hidden role="status" aria-live="polite"></div>

			<div id="agent-activity-sticky" class="agent-activity-sticky" hidden role="status" aria-live="polite"></div>

		</div>

	</header>

	<div id="history-panel" class="history-panel" aria-hidden="true">

		<div class="history-head">

			<span>${historyLabel}</span>

			<button type="button" id="history-close" class="icon-btn" aria-label="Close">${iconClose}</button>

		</div>

		<div class="history-actions">

			<button type="button" id="history-reset-workspace" class="history-reset-btn">${resetWorkspaceLabel}</button>

		</div>

		<div id="history-list" class="history-list"></div>

	</div>

	<div id="log" role="log" aria-live="polite"></div>

	<div id="user-ask" hidden></div>

	<div id="composer">

		<div id="role-model-vignettes" class="agent-vignettes role-model-vignettes" role="group" aria-label="${roleModelsPickerLabel}">

			<button type="button" id="architect-model-vignette" class="agent-vignette role-model-vignette" data-role="architect" aria-expanded="false" title="${architectVignetteName}">

				<span class="vignette-peek" aria-hidden="true"><span class="vignette-peek-icon">🏛</span></span>

				<span class="vignette-rise">

					<span class="vignette-icon" aria-hidden="true">🏛</span>

					<span class="vignette-copy">

						<strong class="vignette-name">${architectVignetteName}</strong>

						<span class="vignette-desc" id="architect-vignette-model-hint">${architectVignetteDesc}</span>

					</span>

				</span>

			</button>

		</div>

		<div id="role-model-panel" class="role-model-panel" hidden role="dialog" aria-modal="false">

			<div class="role-model-panel-head">

				<strong id="role-model-panel-title"></strong>

				<button type="button" id="role-model-panel-close" class="icon-btn role-model-panel-close" aria-label="${rolePanelApplyLabel}">×</button>

			</div>

			<label class="role-model-field">

				<span>${rolePanelModelLabel}</span>

				<select id="role-model-panel-select" class="role-model-panel-select"></select>

			</label>

			${architectContextField}

			${devRoleModelAdvancedFields}

			<div class="role-model-panel-actions">

				<button type="button" id="role-model-panel-reload" class="role-model-panel-btn">${rolePanelReloadLabel}</button>

			</div>

		</div>

		<div id="general-settings-vignettes" class="agent-vignettes general-settings-vignettes" role="group" aria-label="${generalSettingsPickerLabel}">

			<button type="button" id="general-settings-vignette" class="agent-vignette general-settings-vignette" aria-expanded="false" title="${generalSettingsVignetteName}">

				<span class="vignette-peek" aria-hidden="true"><span class="vignette-peek-icon">⚙</span></span>

				<span class="vignette-rise">

					<span class="vignette-icon" aria-hidden="true">⚙</span>

					<span class="vignette-copy">

						<strong class="vignette-name">${generalSettingsVignetteName}</strong>

						<span class="vignette-desc" id="general-settings-vignette-hint">${generalSettingsVignetteDesc}</span>

					</span>

				</span>

			</button>

		</div>

		<div id="general-settings-panel" class="general-settings-panel" hidden role="dialog" aria-modal="false">

			<div class="general-settings-panel-head">

				<strong>${generalSettingsPanelTitle}</strong>

				<button type="button" id="general-settings-panel-close" class="icon-btn general-settings-panel-close" aria-label="${generalSettingsPanelClose}">×</button>

			</div>

			<p class="general-settings-section-label">${generalSettingsSectionConnection}</p>

			<label class="general-settings-field">

				<span>${generalSettingsLlmProvider}</span>

				<select id="general-settings-llm-provider" class="general-settings-input">

					<option value="ollama">Ollama</option>

				</select>

			</label>

			<label class="general-settings-field">

				<span>${generalSettingsServer}</span>

				<input type="text" id="general-settings-server" class="general-settings-input" spellcheck="false" />

			</label>

			<label class="general-settings-field">

				<span>${generalSettingsApiKey}</span>

				<input type="password" id="general-settings-api-key" class="general-settings-input" autocomplete="off" />

			</label>

			${devKeepAliveField}

			${devAgentSectionLabel}

			${devAgentFields}

			<p class="general-settings-section-label">${generalSettingsSectionBehavior}</p>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-warm-start" checked />

				<span>${generalSettingsWarmStart}</span>

			</label>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-confirm-file-writes" />

				<span>${generalSettingsConfirmFileWrites}</span>

			</label>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-open-modified-files" checked />

				<span>${generalSettingsOpenModifiedFiles}</span>

			</label>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-add-diagnostic-on-hover" />

				<span>${generalSettingsAddDiagnosticOnHover}</span>

			</label>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-mcp-tools-enabled" checked />

				<span>${generalSettingsMcpToolsEnabled}</span>

			</label>

			<label class="general-settings-field general-settings-field-check">

				<input type="checkbox" id="general-settings-show-chat-errors-warnings" checked />

				<span>${generalSettingsShowChatErrorsAndWarnings}</span>

			</label>

			<div class="general-settings-panel-actions">

				<button type="button" id="general-settings-open-all" class="general-settings-panel-btn">${generalSettingsOpenAll}</button>

			</div>

		</div>

		<div id="agent-vignettes" class="agent-vignettes mode-vignettes" role="radiogroup" aria-label="${modePickerLabel}">

			<button type="button" class="agent-vignette" data-mode="analyze" aria-pressed="false" title="${modeAnalyzeName}">

				<span class="vignette-peek" aria-hidden="true"><span class="vignette-peek-icon">🔬</span></span>

				<span class="vignette-rise">

					<span class="vignette-icon" aria-hidden="true">🔬</span>

					<span class="vignette-copy">

						<strong class="vignette-name">${modeAnalyzeName}</strong>

						<span class="vignette-desc">${modeAnalyzeDesc}</span>

					</span>

				</span>

			</button>

			<button type="button" class="agent-vignette" data-mode="trustEdit" aria-pressed="false" title="${modeTrustEditName}">

				<span class="vignette-peek" aria-hidden="true"><span class="vignette-peek-icon">✍️</span></span>

				<span class="vignette-rise">

					<span class="vignette-icon" aria-hidden="true">✍️</span>

					<span class="vignette-copy">

						<strong class="vignette-name">${modeTrustEditName}</strong>

						<span class="vignette-desc">${modeTrustEditDesc}</span>

					</span>

				</span>

			</button>

			<button type="button" class="agent-vignette" data-mode="imNotCrazy" aria-pressed="true" title="${modeImNotCrazyName}">

				<span class="vignette-peek" aria-hidden="true"><span class="vignette-peek-icon">🧠</span></span>

				<span class="vignette-rise">

					<span class="vignette-icon" aria-hidden="true">🧠</span>

					<span class="vignette-copy">

						<strong class="vignette-name">${modeImNotCrazyName}</strong>

						<span class="vignette-desc">${modeImNotCrazyDesc}</span>

					</span>

				</span>

			</button>

		</div>

		<div id="pending-prompts" class="pending-prompts" hidden></div>

		<div id="attachments" class="attachments" aria-label="Attached images"></div>

		<div id="refs" class="refs" aria-label="${addRefsLabel}"></div>

		<div id="prompt-suggestions" class="prompt-suggestions" hidden role="listbox" aria-label="${pathSuggestionsLabel}"></div>

		<div class="composer-input-frame">

			<textarea id="prompt" class="prompt-input" rows="3" placeholder="${placeholder}" aria-label="${placeholder}"></textarea>

			<span class="send-wrap">

				<button type="button" id="send" class="composer-send-btn" title="${sendLabel}" aria-label="${sendLabel}">

					<span class="composer-action-icon composer-action-icon-send" aria-hidden="true">${iconSend}</span>

					<span class="composer-action-icon composer-action-icon-stop" aria-hidden="true" hidden>${iconStop}</span>

				</button>

				<span id="send-queue-badge" class="send-queue-badge" hidden aria-hidden="true"></span>

			</span>

		</div>

		<div id="actions">

			<button type="button" id="open-settings" class="icon-btn" title="${settingsLabel}" aria-label="${settingsLabel}">${iconGear}</button>

			<button type="button" id="add-refs" class="icon-btn" title="${addRefsLabel}" aria-label="${addRefsLabel}">${iconFolder}</button>

			<button type="button" id="attach" class="icon-btn" title="${attachLabel}" aria-label="${attachLabel}">${iconAttach}</button>

			<input id="file-input" type="file" accept="image/*" multiple hidden />

			<div id="llm-model-picker-wrap" class="drox-model-picker-wrap" hidden>

				<select id="llm-model-picker" class="drox-model-picker" hidden></select>

				<button type="button" id="llm-model-reload" class="icon-btn drox-model-reload-btn" hidden title="${modelReloadLabel}">${iconReload}</button>

			</div>

			<span id="status">${ready}</span>

		</div>

	</div>

	<footer class="status" aria-label="${localize('droxChatStatusBar', 'Token usage')}">

		<button type="button" id="revert-last-run" class="revert-run-btn" hidden title="${localize('droxChatRevertLastRun', 'Revert file changes from the last agent run')}">${localize('droxChatRevertLastRunLabel', 'Undo last run')}</button>

		<span class="spacer"></span>

		<span class="stat" title="${localize('droxChatTokensIn', 'Cumulative input tokens this session')}">↑ <strong id="tok-in">0</strong></span>

		<span class="stat" title="${localize('droxChatTokensOut', 'Cumulative output tokens this session')}">↓ <strong id="tok-out">0</strong></span>

		<span class="stat stat-cycle" title="${localize('droxChatCycleTime', 'Cycle time since your last message')}"><strong id="cycle-elapsed">00:00:00</strong></span>

		<span class="stat" title="${localize('droxChatCtx', 'Estimated tokens in the current context window')}">ctx <strong id="ctx">0</strong></span>

	</footer>

${scriptTags}

</body>

</html>`;

}


