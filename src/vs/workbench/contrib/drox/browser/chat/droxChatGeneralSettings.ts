/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { applyDroxConfigurationUpdate, droxConfigurationResourceForRead, readDroxChatConfigurationValue, readDroxChatConfigurationString } from '../../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { readLlmProvider } from '../../common/droxLlmCatalog.js';
import { readLlmHeadersMap } from '../../common/droxLlmHeaders.js';
import { isMcpToolsEnabled, readLlmSettings } from '../../common/droxRunSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { formatDroxConnectionSummary, normalizeDroxLlmHosting } from './droxConnectionCatalog.js';
export interface IDroxGeneralSettingsWire {
	readonly llmHosting: string;
	readonly llmProvider: string;
	readonly server: string;
	readonly apiKey: string;
	readonly llmHeaders: Record<string, string>;
	readonly connectionSummary: string;
	readonly maxIterations: number;
	readonly nativeThinking: boolean;
	readonly primaryLanguage: string;
	readonly warmStart: boolean;
	readonly confirmFileWrites: boolean;
	readonly openModifiedFiles: boolean;
	readonly addDiagnosticOnHover: boolean;
	readonly mcpToolsEnabled: boolean;
	readonly showChatErrorsAndWarnings: boolean;
}
export interface IDroxGeneralSettingsPatch {
	readonly llmHosting?: string;
	readonly llmProvider?: string;
	readonly server?: string;
	readonly apiKey?: string;
	readonly llmHeaders?: Record<string, string>;
	readonly maxIterations?: number;
	readonly nativeThinking?: boolean;
	readonly primaryLanguage?: string;
	readonly warmStart?: boolean;
	readonly confirmFileWrites?: boolean;
	readonly openModifiedFiles?: boolean;
	readonly addDiagnosticOnHover?: boolean;
	readonly mcpToolsEnabled?: boolean;
	readonly showChatErrorsAndWarnings?: boolean;
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
	const v = readDroxChatConfigurationValue<boolean>(configService, key, resource);
	return typeof v === 'boolean' ? v : defaultValue;
}
export function readDroxGeneralSettingsForWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {
		configurationService: IConfigurationService;
	},
): IDroxGeneralSettingsWire {
	const workspaceResource = deps.runSettingsService.getWorkspaceResource();
	const resource = droxConfigurationResourceForRead(deps.configurationService, workspaceResource);
	const llm = readLlmSettings(deps.configurationService, resource);
	const provider = readLlmProvider(deps.configurationService, resource);
	const hosting = normalizeDroxLlmHosting(readDroxChatConfigurationString(deps.configurationService, DroxSetting.LlmHosting, workspaceResource));
	const llmHeaders = readLlmHeadersMap(deps.configurationService, resource);
	const wire: Omit<IDroxGeneralSettingsWire, 'connectionSummary'> = {
		llmHosting: hosting,
		llmProvider: provider,
		server: llm.server,
		apiKey: llm.apiKey,
		llmHeaders,
		maxIterations: llm.maxIterations,
		nativeThinking: llm.nativeThinking,
		primaryLanguage: llm.primaryLanguage,
		warmStart: readBool(deps.configurationService, DroxSetting.WarmStart, resource, true),
		confirmFileWrites: readBool(deps.configurationService, DroxSetting.ConfirmFileWrites, resource, false),
		openModifiedFiles: readBool(deps.configurationService, DroxSetting.OpenModifiedFiles, resource, true),
		addDiagnosticOnHover: readBool(deps.configurationService, DroxSetting.AddDiagnosticOnHover, resource, false),
		mcpToolsEnabled: isMcpToolsEnabled(deps.configurationService, resource),
		showChatErrorsAndWarnings: readBool(deps.configurationService, DroxSetting.ChatShowErrorsAndWarnings, resource, true),
	};
	return {
		...wire,
		connectionSummary: formatDroxConnectionSummary(wire),
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
	const workspaceResource = deps.runSettingsService.getWorkspaceResource();
	const update = async (key: string, value: unknown): Promise<void> => {
		await applyDroxConfigurationUpdate(deps.configurationService, key, value, workspaceResource);
	};
	if (patch.llmHosting !== undefined) {
		const h = normalizeDroxLlmHosting(patch.llmHosting);
		await update(DroxSetting.LlmHosting, h);
	}
	if (patch.llmProvider !== undefined) {
		await update(DroxSetting.LlmProvider, String(patch.llmProvider).trim() || 'ollama');
	}
	if (patch.server !== undefined) {
		await update(DroxSetting.Server, String(patch.server).trim());
	}
	if (patch.apiKey !== undefined) {
		await update(DroxSetting.ApiKey, String(patch.apiKey).trim());
	}
	if (patch.llmHeaders !== undefined && patch.llmHeaders && typeof patch.llmHeaders === 'object') {
		const cleaned: Record<string, string> = {};
		for (const [key, value] of Object.entries(patch.llmHeaders)) {
			const name = String(key).trim();
			if (!name) {
				continue;
			}
			cleaned[name] = String(value ?? '').trim();
		}
		await update(DroxSetting.LlmHeaders, cleaned);
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
}
