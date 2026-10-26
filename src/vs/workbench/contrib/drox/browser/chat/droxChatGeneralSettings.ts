/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { applyDroxConfigurationUpdate, droxConfigurationResourceForRead, readDroxChatConfigurationValue, readDroxChatConfigurationString } from '../../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { normalizeDroxEngineProfile, type DroxEngineProfileId } from '../../common/droxEngineProfile.js';
import { readLlmProvider } from '../../common/droxLlmCatalog.js';
import { readLlmHeadersMap } from '../../common/droxLlmHeaders.js';
import { isMcpToolsEnabled, readLlmSettings, readSubagentsSettings } from '../../common/droxRunSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { DROX_DEFAULT_SUBAGENTS_MAX_ITERATIONS, DROX_MAX_ITERATIONS_CAP } from '../../common/droxProductDefaults.js';
import { formatDroxConnectionSummary, normalizeDroxLlmHosting } from './droxConnectionCatalog.js';
export interface IDroxGeneralSettingsWire {
	readonly llmHosting: string;
	readonly llmProvider: string;
	readonly server: string;
	readonly apiKey: string;
	readonly llmHeaders: Record<string, string>;
	readonly connectionSummary: string;
	readonly maxIterations: number;
	readonly engineProfile: DroxEngineProfileId;
	readonly nativeThinking: boolean;
	readonly primaryLanguage: string;
	readonly warmStart: boolean;
	readonly confirmFileWrites: boolean;
	readonly openModifiedFiles: boolean;
	readonly addDiagnosticOnHover: boolean;
	readonly mcpToolsEnabled: boolean;
	readonly showChatErrorsAndWarnings: boolean;
	readonly subagentsEnabled: boolean;
	readonly subagentsMaxIterations: number;
	readonly subagentsExecutionThink: boolean;
	readonly subagentsReportThink: boolean;
	readonly projectRulesEnabled: boolean;
	readonly allowOutsideWorkspaceRead: boolean;
	readonly allowOutsideWorkspaceWrite: boolean;
}
export interface IDroxGeneralSettingsPatch {
	readonly llmHosting?: string;
	readonly llmProvider?: string;
	readonly server?: string;
	readonly apiKey?: string;
	readonly llmHeaders?: Record<string, string>;
	readonly maxIterations?: number;
	readonly engineProfile?: string;
	readonly nativeThinking?: boolean;
	readonly primaryLanguage?: string;
	readonly warmStart?: boolean;
	readonly confirmFileWrites?: boolean;
	readonly openModifiedFiles?: boolean;
	readonly addDiagnosticOnHover?: boolean;
	readonly mcpToolsEnabled?: boolean;
	readonly showChatErrorsAndWarnings?: boolean;
	readonly subagentsEnabled?: boolean;
	readonly subagentsMaxIterations?: number;
	readonly subagentsExecutionThink?: boolean;
	readonly subagentsReportThink?: boolean;
	readonly projectRulesEnabled?: boolean;
	readonly allowOutsideWorkspaceRead?: boolean;
	readonly allowOutsideWorkspaceWrite?: boolean;
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
	const subagents = readSubagentsSettings(deps.configurationService, resource);
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
		engineProfile: llm.engineProfile,
		nativeThinking: llm.nativeThinking,
		primaryLanguage: llm.primaryLanguage,
		warmStart: readBool(deps.configurationService, DroxSetting.WarmStart, resource, true),
		confirmFileWrites: readBool(deps.configurationService, DroxSetting.ConfirmFileWrites, resource, false),
		openModifiedFiles: readBool(deps.configurationService, DroxSetting.OpenModifiedFiles, resource, true),
		addDiagnosticOnHover: readBool(deps.configurationService, DroxSetting.AddDiagnosticOnHover, resource, false),
		mcpToolsEnabled: isMcpToolsEnabled(deps.configurationService, resource),
		showChatErrorsAndWarnings: readBool(deps.configurationService, DroxSetting.ChatShowErrorsAndWarnings, resource, true),
		subagentsEnabled: subagents.enabled,
		subagentsMaxIterations: subagents.maxIterations || DROX_DEFAULT_SUBAGENTS_MAX_ITERATIONS,
		subagentsExecutionThink: subagents.executionThink === true,
		subagentsReportThink: subagents.reportThink === true,
		projectRulesEnabled: readBool(deps.configurationService, DroxSetting.RulesEnabled, resource, true),
		allowOutsideWorkspaceRead: readBool(deps.configurationService, DroxSetting.AllowOutsideWorkspaceRead, resource, false),
		allowOutsideWorkspaceWrite: readBool(deps.configurationService, DroxSetting.AllowOutsideWorkspaceWrite, resource, false),
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
	if (patch.llmProvider !== undefined) {
		await update(DroxSetting.LlmProvider, String(patch.llmProvider).trim() || 'ollama');
	}
	if (patch.server !== undefined) {
		await update(DroxSetting.Server, String(patch.server).trim());
	}
	// Ne jamais effacer `llmHosting` par un patch partiel (null/"").
	// Serveur sans hosting wizard → `personal` pour garder le chip « Connect » stable.
	if (patch.llmHosting !== undefined || patch.server !== undefined) {
		const serverTrimmed = patch.server !== undefined
			? String(patch.server).trim()
			: readDroxChatConfigurationString(deps.configurationService, DroxSetting.Server, workspaceResource);
		const hostingFromPatch = patch.llmHosting !== undefined
			? normalizeDroxLlmHosting(patch.llmHosting)
			: undefined;
		if (hostingFromPatch) {
			await update(DroxSetting.LlmHosting, hostingFromPatch);
		} else if (serverTrimmed) {
			const existing = normalizeDroxLlmHosting(
				readDroxChatConfigurationString(deps.configurationService, DroxSetting.LlmHosting, workspaceResource),
			);
			await update(DroxSetting.LlmHosting, existing || 'personal');
		} else if (patch.server !== undefined) {
			await update(DroxSetting.LlmHosting, '');
		}
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
		await update(DroxSetting.MaxIterations, Math.min(DROX_MAX_ITERATIONS_CAP, Math.max(1, Math.floor(patch.maxIterations))));
	}
	if (patch.engineProfile !== undefined) {
		await update(DroxSetting.EngineProfile, normalizeDroxEngineProfile(patch.engineProfile));
	}
	if (patch.subagentsMaxIterations !== undefined && Number.isFinite(patch.subagentsMaxIterations)) {
		await update(DroxSetting.SubagentsMaxIterations, Math.max(1, Math.floor(patch.subagentsMaxIterations)));
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
	if (patch.subagentsEnabled !== undefined) {
		await update(DroxSetting.SubagentsEnabled, Boolean(patch.subagentsEnabled));
	}
	if (patch.subagentsExecutionThink !== undefined) {
		await update(DroxSetting.SubagentsExecutionThink, Boolean(patch.subagentsExecutionThink));
	}
	if (patch.subagentsReportThink !== undefined) {
		await update(DroxSetting.SubagentsReportThink, Boolean(patch.subagentsReportThink));
	}
	if (patch.projectRulesEnabled !== undefined) {
		await update(DroxSetting.RulesEnabled, Boolean(patch.projectRulesEnabled));
	}
	if (patch.allowOutsideWorkspaceRead !== undefined) {
		await update(DroxSetting.AllowOutsideWorkspaceRead, Boolean(patch.allowOutsideWorkspaceRead));
	}
	if (patch.allowOutsideWorkspaceWrite !== undefined) {
		await update(DroxSetting.AllowOutsideWorkspaceWrite, Boolean(patch.allowOutsideWorkspaceWrite));
	}
}

/** Effective hors-WS flags for a run: workspace config ∪ session toggles. */
export function resolveDroxAllowOutsideWorkspaceForRun(
	configurationService: IConfigurationService | undefined,
	workspaceResource: ReturnType<IDroxRunSettingsService['getWorkspaceResource']>,
	session?: { isAllowOutsideWorkspaceRead(id: string): boolean; isAllowOutsideWorkspaceWrite(id: string): boolean },
	sessionId?: string,
): { allowOutsideWorkspaceRead: boolean; allowOutsideWorkspaceWrite: boolean } {
	const configRead = configurationService
		? readBool(
			configurationService,
			DroxSetting.AllowOutsideWorkspaceRead,
			droxConfigurationResourceForRead(configurationService, workspaceResource),
			false,
		)
		: false;
	const configWrite = configurationService
		? readBool(
			configurationService,
			DroxSetting.AllowOutsideWorkspaceWrite,
			droxConfigurationResourceForRead(configurationService, workspaceResource),
			false,
		)
		: false;
	const sessionRead = sessionId && session ? session.isAllowOutsideWorkspaceRead(sessionId) : false;
	const sessionWrite = sessionId && session ? session.isAllowOutsideWorkspaceWrite(sessionId) : false;
	return {
		allowOutsideWorkspaceRead: configRead || sessionRead,
		allowOutsideWorkspaceWrite: configWrite || sessionWrite,
	};
}
