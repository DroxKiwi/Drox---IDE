/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';

/** Clés panneau Architecte 🏛 — miroir `agent.run` sampling. */
export const DROX_CHAT_ARCHITECT_SETTING_KEYS: readonly string[] = [
	DroxSetting.ArchitectModel,
	DroxSetting.Model,
	DroxSetting.NumCtx,
	DroxSetting.Temperature,
	DroxSetting.TopP,
	DroxSetting.TopK,
	DroxSetting.RepeatPenalty,
	DroxSetting.MinP,
	DroxSetting.Seed,
	DroxSetting.PresencePenalty,
	DroxSetting.FrequencyPenalty,
	DroxSetting.MaxTokens,
	DroxSetting.KeepAlive,
];

/** Clés panneau Général ⚙ — run + comportement IDE. */
export const DROX_CHAT_GENERAL_SETTING_KEYS: readonly string[] = [
	DroxSetting.Server,
	DroxSetting.ApiKey,
	DroxSetting.LlmHeaders,
	DroxSetting.LlmProvider,
	DroxSetting.LlmHosting,
	DroxSetting.MaxIterations,
	DroxSetting.NativeThinking,
	DroxSetting.PrimaryLanguage,
	DroxSetting.WarmStart,
	DroxSetting.ConfirmFileWrites,
	DroxSetting.OpenModifiedFiles,
	DroxSetting.AddDiagnosticOnHover,
	DroxSetting.ToolsMcpEnabled,
	DroxSetting.ToolsDisabled,
	DroxSetting.ChatShowErrorsAndWarnings,
];

export function droxConfigChangeAffectsArchitectSettings(e: IConfigurationChangeEvent): boolean {
	return DROX_CHAT_ARCHITECT_SETTING_KEYS.some(key => e.affectsConfiguration(key));
}

export function droxConfigChangeAffectsGeneralSettings(e: IConfigurationChangeEvent): boolean {
	return DROX_CHAT_GENERAL_SETTING_KEYS.some(key => e.affectsConfiguration(key));
}
