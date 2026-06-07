/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { DROX_ENGINE_TUNING_RPC_FIELDS } from '../../common/droxEngineTuning.js';
import {
	DroxEngineStrictnessPreset,
	normalizeDroxEngineStrictnessPreset,
	readDroxEngineStrictness,
} from '../../common/droxEngineStrictness.js';
import { isMcpToolsEnabled, readLlmSettings } from '../../common/droxRunSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';

export interface IDroxGeneralSettingsWire {
	readonly llmProvider: string;
	readonly server: string;
	readonly apiKey: string;
	readonly executablePath: string;
	readonly maxIterations: number;
	readonly nativeThinking: boolean;
	readonly primaryLanguage: string;
	readonly maxTokens?: number;
	readonly numPredict?: number;
	readonly keepAlive: string;
	readonly warmStart: boolean;
	readonly confirmFileWrites: boolean;
	readonly openModifiedFiles: boolean;
	readonly addDiagnosticOnHover: boolean;
	readonly mcpToolsEnabled: boolean;
	readonly showChatErrorsAndWarnings: boolean;
	readonly engineStrictness: DroxEngineStrictnessPreset;
	/** Surcharges affichées/éditables uniquement si `engineStrictness === 'custom'`. */
	readonly engineTuning?: Record<string, number | boolean>;
}

export interface IDroxGeneralSettingsPatch {
	readonly llmProvider?: string;
	readonly server?: string;
	readonly apiKey?: string;
	readonly executablePath?: string;
	readonly maxIterations?: number;
	readonly nativeThinking?: boolean;
	readonly primaryLanguage?: string;
	readonly maxTokens?: number;
	readonly numPredict?: number;
	readonly keepAlive?: string;
	readonly warmStart?: boolean;
	readonly confirmFileWrites?: boolean;
	readonly openModifiedFiles?: boolean;
	readonly addDiagnosticOnHover?: boolean;
	readonly mcpToolsEnabled?: boolean;
	readonly showChatErrorsAndWarnings?: boolean;
	readonly engineStrictness?: DroxEngineStrictnessPreset;
	readonly engineTuning?: Record<string, number | boolean>;
}

export interface IDroxChatGeneralSettingsHost {
	post(message: DroxHostToWebviewMessage): void;
}

function readBool(
	configService: IConfigurationService,
	key: string,
	resource: ReturnType<IDroxRunSettingsService['getWorkspaceResource']>,
	defaultValue: boolean,
): boolean {
	const v = configService.getValue<boolean>(key, { resource });
	return typeof v === 'boolean' ? v : defaultValue;
}

export function readDroxGeneralSettingsForWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {
		configurationService: IConfigurationService;
	},
): IDroxGeneralSettingsWire {
	const resource = deps.runSettingsService.getWorkspaceResource();
	const llm = readLlmSettings(deps.configurationService, resource);
	const str = (key: string): string => {
		const v = deps.configurationService.getValue<string>(key, { resource });
		return typeof v === 'string' ? v.trim() : '';
	};
	const provider = deps.configurationService.getValue<string>(DroxSetting.LlmProvider, { resource });
	const engineStrictness = readDroxEngineStrictness(deps.configurationService, resource);
	const engineTuning: Record<string, number | boolean> = {};
	if (engineStrictness === 'custom') {
		for (const { rpcKey, settingKey, kind } of DROX_ENGINE_TUNING_RPC_FIELDS) {
			const v = deps.configurationService.getValue<number | boolean>(settingKey, { resource });
			if (kind === 'boolean') {
				if (typeof v === 'boolean') {
					engineTuning[rpcKey] = v;
				}
			} else if (typeof v === 'number' && !Number.isNaN(v)) {
				if ((rpcKey === 'maxTodoItems' || rpcKey === 'memoryBudgetTokens') && v <= 0) {
					continue;
				}
				engineTuning[rpcKey] = v;
			}
		}
	}

	return {
		llmProvider: typeof provider === 'string' && provider ? provider : 'ollama',
		server: llm.server,
		apiKey: llm.apiKey,
		executablePath: str(DroxSetting.ExecutablePath),
		maxIterations: llm.maxIterations,
		nativeThinking: llm.nativeThinking,
		primaryLanguage: llm.primaryLanguage,
		maxTokens: llm.maxTokens,
		numPredict: llm.numPredict,
		keepAlive: llm.keepAlive,
		warmStart: readBool(deps.configurationService, DroxSetting.WarmStart, resource, true),
		confirmFileWrites: readBool(deps.configurationService, DroxSetting.ConfirmFileWrites, resource, false),
		openModifiedFiles: readBool(deps.configurationService, DroxSetting.OpenModifiedFiles, resource, true),
		addDiagnosticOnHover: readBool(deps.configurationService, DroxSetting.AddDiagnosticOnHover, resource, false),
		mcpToolsEnabled: isMcpToolsEnabled(deps.configurationService, resource),
		showChatErrorsAndWarnings: readBool(deps.configurationService, DroxSetting.ChatShowErrorsAndWarnings, resource, true),
		engineStrictness,
		engineTuning: Object.keys(engineTuning).length > 0 ? engineTuning : undefined,
	};
}

export function pushGeneralSettingsToWebview(
	host: IDroxChatGeneralSettingsHost,
	runSettingsService: IDroxRunSettingsService,
	configurationService: IConfigurationService,
): void {
	host.post({
		kind: 'generalSettings',
		settings: readDroxGeneralSettingsForWebview({ runSettingsService, configurationService }) as unknown as Record<string, unknown>,
	});
}

export async function setDroxGeneralSettingsFromWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {
		configurationService: IConfigurationService;
	},
	patch: IDroxGeneralSettingsPatch,
): Promise<void> {
	const resource = deps.runSettingsService.getWorkspaceResource();
	const update = async (key: string, value: unknown): Promise<void> => {
		await deps.configurationService.updateValue(key, value, { resource });
	};
	if (patch.llmProvider !== undefined) {
		await update(DroxSetting.LlmProvider, String(patch.llmProvider).trim() || 'ollama');
	}
	if (patch.server !== undefined) {
		await update(DroxSetting.Server, String(patch.server).trim());
	}
	if (patch.apiKey !== undefined) {
		await update(DroxSetting.ApiKey, String(patch.apiKey).trim());
	}
	if (patch.executablePath !== undefined) {
		await update(DroxSetting.ExecutablePath, String(patch.executablePath).trim());
	}
	if (patch.maxIterations !== undefined && Number.isFinite(patch.maxIterations)) {
		await update(DroxSetting.MaxIterations, Math.min(200, Math.max(1, Math.floor(patch.maxIterations))));
	}
	if (patch.nativeThinking !== undefined) {
		await update(DroxSetting.NativeThinking, Boolean(patch.nativeThinking));
	}
	if (patch.primaryLanguage !== undefined) {
		await update(DroxSetting.PrimaryLanguage, String(patch.primaryLanguage).trim());
	}
	if (patch.maxTokens !== undefined) {
		const n = patch.maxTokens;
		await update(DroxSetting.MaxTokens, n === undefined || !Number.isFinite(n) ? undefined : Math.max(1, Math.floor(n)));
	}
	if (patch.numPredict !== undefined) {
		const n = patch.numPredict;
		await update(DroxSetting.NumPredict, n === undefined || !Number.isFinite(n) ? undefined : Math.max(1, Math.floor(n)));
	}
	if (patch.keepAlive !== undefined) {
		await update(DroxSetting.KeepAlive, String(patch.keepAlive).trim());
	}
	if (patch.warmStart !== undefined) {
		await update(DroxSetting.WarmStart, Boolean(patch.warmStart));
	}
	if (patch.confirmFileWrites !== undefined) {
		await update(DroxSetting.ConfirmFileWrites, Boolean(patch.confirmFileWrites));
	}
	if (patch.openModifiedFiles !== undefined) {
		await update(DroxSetting.OpenModifiedFiles, Boolean(patch.openModifiedFiles));
	}
	if (patch.addDiagnosticOnHover !== undefined) {
		await update(DroxSetting.AddDiagnosticOnHover, Boolean(patch.addDiagnosticOnHover));
	}
	if (patch.mcpToolsEnabled !== undefined) {
		await update(DroxSetting.ToolsMcpEnabled, Boolean(patch.mcpToolsEnabled));
	}
	if (patch.showChatErrorsAndWarnings !== undefined) {
		await update(DroxSetting.ChatShowErrorsAndWarnings, Boolean(patch.showChatErrorsAndWarnings));
	}
	if (patch.engineStrictness !== undefined) {
		await update(DroxSetting.EngineStrictness, normalizeDroxEngineStrictnessPreset(patch.engineStrictness));
	}
	if (patch.engineTuning && typeof patch.engineTuning === 'object') {
		for (const { rpcKey, settingKey, kind } of DROX_ENGINE_TUNING_RPC_FIELDS) {
			if (!(rpcKey in patch.engineTuning)) {
				continue;
			}
			const raw = patch.engineTuning[rpcKey];
			if (kind === 'boolean') {
				await update(settingKey, Boolean(raw));
			} else if (typeof raw === 'number' && Number.isFinite(raw)) {
				await update(settingKey, raw);
			}
		}
	}
}
