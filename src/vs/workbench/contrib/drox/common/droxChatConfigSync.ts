/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { readDroxArchitectModelUser, readDroxChatConfigurationString } from './droxAgentsConfiguration.js';
import { DroxSetting } from './droxConfiguration.js';
import { normalizeLlmServerBaseUrl, readLlmProvider } from './droxLlmCatalog.js';
import { IDroxLlmModelsSnapshot } from './droxLlmModelsService.js';

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

export function droxConfigChangeAffectsPermissionMode(e: IConfigurationChangeEvent): boolean {
	return e.affectsConfiguration(DroxSetting.PermissionMode);
}

/** Vrai si la config USER (serveur / provider / modèle architecte) diverge du snapshot local. */
export function droxLlmSnapshotDiffersFromConfiguration(
	snapshot: Pick<IDroxLlmModelsSnapshot, 'provider' | 'server' | 'selected'>,
	configurationService: IConfigurationService,
	workspaceResource?: URI,
): boolean {
	const configuredServer = readDroxChatConfigurationString(configurationService, DroxSetting.Server, workspaceResource);
	const provider = readLlmProvider(configurationService, workspaceResource);
	const selected = readDroxArchitectModelUser(configurationService);
	const server = normalizeLlmServerBaseUrl(configuredServer);
	return provider !== snapshot.provider || server !== snapshot.server || selected !== snapshot.selected;
}
