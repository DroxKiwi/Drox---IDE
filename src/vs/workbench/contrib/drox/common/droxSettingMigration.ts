/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';

/** Anciennes clés `nexus.drox.*` (pré-rebrand Drox IDE). */
const LEGACY_NEXUS_PREFIX = 'nexus.drox.';

const ALL_DROX_SETTING_KEYS: string[] = [
	DroxSetting.ExecutablePath,
	DroxSetting.Server,
	DroxSetting.LlmProvider,
	DroxSetting.ArchitectModel,
	DroxSetting.ExecutorModel,
	DroxSetting.OrchestrationMaxParallelExecutors,
	DroxSetting.Model,
	DroxSetting.PermissionMode,
	DroxSetting.ApiKey,
	DroxSetting.PrimaryLanguage,
	DroxSetting.MaxIterations,
	DroxSetting.NativeThinking,
	DroxSetting.Temperature,
	DroxSetting.MaxTokens,
	DroxSetting.NumPredict,
	DroxSetting.NumCtx,
	DroxSetting.TopP,
	DroxSetting.TopK,
	DroxSetting.RepeatPenalty,
	DroxSetting.Seed,
	DroxSetting.MinP,
	DroxSetting.PresencePenalty,
	DroxSetting.FrequencyPenalty,
	DroxSetting.KeepAlive,
	DroxSetting.ConfirmFileWrites,
	DroxSetting.AddDiagnosticOnHover,
	DroxSetting.OpenModifiedFiles,
	DroxSetting.WarmStart,
	DroxSetting.ChatShowErrorsAndWarnings,
	DroxSetting.ToolsDisabled,
	DroxSetting.ToolsMcpEnabled,
	DroxSetting.SubagentsEnabled,
	DroxSetting.SubagentsMaxIterations,
	DroxSetting.SubagentsMaxConcurrent,
	DroxSetting.SubagentsModel,
	DroxSetting.SubagentsNumCtx,
];

function migrateNexusDroxKey(legacyKey: string, newKey: string) {
	return {
		key: legacyKey,
		migrateFn: (value: unknown) => {
			if (value === undefined) {
				return [];
			}
			return [
				[newKey, { value }],
				[legacyKey, { value: undefined }],
			];
		},
	};
}

const migrations = ALL_DROX_SETTING_KEYS.map((newKey) =>
	migrateNexusDroxKey(`${LEGACY_NEXUS_PREFIX}${newKey.slice('drox.'.length)}`, newKey),
);

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration)
	.registerConfigurationMigrations(migrations);
