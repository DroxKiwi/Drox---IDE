/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';
import { llmHeadersForRpc, readLlmHeadersMap, shouldSendApiKeyRpcParam } from './droxLlmHeaders.js';
import { parseLlmProvider, type DroxLlmProviderId } from './droxLlmCatalog.js';
import { DROX_DEFAULT_MAX_ITERATIONS, DROX_DEFAULT_NUM_CTX } from './droxProductDefaults.js';
import { clampDroxNumCtx } from './droxNumCtx.js';
import { IDroxAgentRunImage } from './droxAttachments.js';
import { getDisabledToolNames } from './droxToolCatalog.js';
import { DroxPermissionMode, normalizeDroxPermissionMode } from './droxPermissionAsk.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';
import {
	readDroxChatConfigurationValue,
	readDroxChatConfigurationString,
	readDroxArchitectModelForContext,
} from './droxAgentsConfiguration.js';
export interface IDroxLlmSettings {
	readonly server: string;
	readonly model: string;
	readonly apiKey: string;
	readonly llmHeaders: Readonly<Record<string, string>>;
	readonly llmProvider: DroxLlmProviderId;
	readonly primaryLanguage: string;
	readonly maxIterations: number;
	readonly temperature: number | undefined;
	readonly maxTokens: number | undefined;
	readonly numPredict: number | undefined;
	readonly numCtx: number | undefined;
	readonly topP: number | undefined;
	readonly topK: number | undefined;
	readonly repeatPenalty: number | undefined;
	readonly seed: number | undefined;
	readonly minP: number | undefined;
	readonly presencePenalty: number | undefined;
	readonly frequencyPenalty: number | undefined;
	readonly keepAlive: string;
	readonly nativeThinking: boolean;
}
export function readPermissionMode(configService: IConfigurationService, resource?: URI): DroxPermissionMode {
	const v = readDroxChatConfigurationValue<string>(configService, DroxSetting.PermissionMode, resource);
	return normalizeDroxPermissionMode(v);
}
/** Plafond de sortie RPC : `maxTokens` prioritaire, repli lecture `numPredict` (legacy). */
export function effectiveMaxTokensForRun(settings: IDroxLlmSettings): number | undefined {
	if (settings.maxTokens !== undefined && settings.maxTokens > 0) {
		return Math.floor(settings.maxTokens);
	}
	if (settings.numPredict !== undefined && settings.numPredict > 0) {
		return Math.floor(settings.numPredict);
	}
	return undefined;
}
export function readLlmSettings(configService: IConfigurationService, resource?: URI): IDroxLlmSettings {
	const str = (key: string): string => readDroxChatConfigurationString(configService, key, resource);
	const num = (key: string): number | undefined => {
		const v = readDroxChatConfigurationValue<number>(configService, key, resource);
		return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
	};
	const bool = (key: string, defaultValue: boolean): boolean => {
		const v = readDroxChatConfigurationValue<boolean>(configService, key, resource);
		return typeof v === 'boolean' ? v : defaultValue;
	};
	return {
		server: str(DroxSetting.Server),
		model: readDroxArchitectModelForContext(configService, resource),
		apiKey: str(DroxSetting.ApiKey),
		llmHeaders: readLlmHeadersMap(configService, resource),
		llmProvider: parseLlmProvider(readDroxChatConfigurationValue<string>(configService, DroxSetting.LlmProvider, resource)),
		primaryLanguage: str(DroxSetting.PrimaryLanguage),
		maxIterations: readDroxChatConfigurationValue<number>(configService, DroxSetting.MaxIterations, resource) ?? DROX_DEFAULT_MAX_ITERATIONS,
		temperature: num(DroxSetting.Temperature),
		maxTokens: num(DroxSetting.MaxTokens),
		numPredict: num(DroxSetting.NumPredict),
		numCtx: clampDroxNumCtx(num(DroxSetting.NumCtx) ?? DROX_DEFAULT_NUM_CTX),
		topP: num(DroxSetting.TopP),
		topK: num(DroxSetting.TopK),
		repeatPenalty: num(DroxSetting.RepeatPenalty),
		seed: num(DroxSetting.Seed),
		minP: num(DroxSetting.MinP),
		presencePenalty: num(DroxSetting.PresencePenalty),
		frequencyPenalty: num(DroxSetting.FrequencyPenalty),
		keepAlive: str(DroxSetting.KeepAlive),
		nativeThinking: bool(DroxSetting.NativeThinking, false),
	};
}
export function llmSettingsToEnv(settings: IDroxLlmSettings): Record<string, string> {
	const env: Record<string, string> = {};
	if (settings.server) {
		env.DROX_SERVER = settings.server;
	}
	if (settings.model) {
		env.DROX_MODEL = settings.model;
	}
	if (settings.apiKey) {
		env.DROX_API_KEY = settings.apiKey;
	}
	if (settings.primaryLanguage) {
		env.DROX_PRIMARY_LANGUAGE = settings.primaryLanguage;
	}
	const maxOut = effectiveMaxTokensForRun(settings);
	if (maxOut !== undefined) {
		env.DROX_NUM_PREDICT = String(maxOut);
	}
	if (settings.numCtx !== undefined && settings.numCtx > 0) {
		env.DROX_NUM_CTX = String(Math.floor(settings.numCtx));
	}
	if (settings.topP !== undefined) {
		env.DROX_TOP_P = String(settings.topP);
	}
	if (settings.topK !== undefined && settings.topK > 0) {
		env.DROX_TOP_K = String(Math.floor(settings.topK));
	}
	if (settings.repeatPenalty !== undefined) {
		env.DROX_REPEAT_PENALTY = String(settings.repeatPenalty);
	}
	if (settings.seed !== undefined) {
		env.DROX_SEED = String(Math.floor(settings.seed));
	}
	if (settings.minP !== undefined) {
		env.DROX_MIN_P = String(settings.minP);
	}
	if (settings.presencePenalty !== undefined) {
		env.DROX_PRESENCE_PENALTY = String(settings.presencePenalty);
	}
	if (settings.frequencyPenalty !== undefined) {
		env.DROX_FREQUENCY_PENALTY = String(settings.frequencyPenalty);
	}
	if (settings.keepAlive) {
		env.DROX_KEEP_ALIVE = settings.keepAlive;
	}
	return env;
}
export function readDisabledToolsForRun(configService: IConfigurationService, resource?: URI): string[] {
	const raw = readDroxChatConfigurationValue<string[]>(configService, DroxSetting.ToolsDisabled, resource) ?? [];
	return [...getDisabledToolNames(raw)].sort();
}
export function isMcpToolsEnabled(configService: IConfigurationService, resource?: URI): boolean {
	return readDroxChatConfigurationValue<boolean>(configService, DroxSetting.ToolsMcpEnabled, resource) !== false;
}
function wireOptionalNumber(params: Record<string, unknown>, key: string, value: number | undefined): void {
	if (value !== undefined && Number.isFinite(value)) {
		params[key] = value;
	}
}
function wireOptionalPositiveInt(params: Record<string, unknown>, key: string, value: number | undefined): void {
	if (value !== undefined && value > 0) {
		params[key] = Math.floor(value);
	}
}
export function buildAgentRunParams(opts: {
	readonly prompt: string;
	readonly workspace: string;
	readonly mode: string;
	readonly sessionId: string;
	readonly settings: IDroxLlmSettings;
	readonly disabledTools: readonly string[];
	readonly mcpToolsEnabled: boolean;
	readonly images?: readonly IDroxAgentRunImage[];
	readonly runObjective?: string;
	readonly skipUserTurn?: boolean;
	readonly allowOutsideWorkspace?: boolean;
}): Record<string, unknown> {
	const wireMode = normalizeDroxPermissionMode(opts.mode);
	const params: Record<string, unknown> = {
		prompt: opts.prompt,
		workspace: opts.workspace,
		mode: wireMode,
		applyEdits: wireMode !== 'analyze',
		sessionId: opts.sessionId,
		sessionDir: droxWorkspaceSessionsDir(opts.workspace),
		maxIterations: opts.settings.maxIterations,
		nativeThinking: opts.settings.nativeThinking,
		mcpToolsEnabled: opts.mcpToolsEnabled,
	};
	if (opts.settings.server) {
		params.server = opts.settings.server;
	}
	if (opts.settings.model) {
		params.model = opts.settings.model;
	}
	const authContext = {
		provider: opts.settings.llmProvider,
		server: opts.settings.server,
	};
	const headers = llmHeadersForRpc(opts.settings.apiKey, opts.settings.llmHeaders, authContext);
	if (headers) {
		params.headers = headers;
	}
	if (shouldSendApiKeyRpcParam(opts.settings.apiKey, headers ?? {})) {
		params.apiKey = opts.settings.apiKey;
	}
	wireOptionalNumber(params, 'temperature', opts.settings.temperature);
	const maxTokens = effectiveMaxTokensForRun(opts.settings);
	wireOptionalPositiveInt(params, 'maxTokens', maxTokens);
	wireOptionalPositiveInt(params, 'numCtx', opts.settings.numCtx);
	wireOptionalNumber(params, 'topP', opts.settings.topP);
	wireOptionalPositiveInt(params, 'topK', opts.settings.topK);
	wireOptionalNumber(params, 'repeatPenalty', opts.settings.repeatPenalty);
	wireOptionalNumber(params, 'minP', opts.settings.minP);
	if (opts.settings.seed !== undefined) {
		params.seed = Math.floor(opts.settings.seed);
	}
	wireOptionalNumber(params, 'presencePenalty', opts.settings.presencePenalty);
	wireOptionalNumber(params, 'frequencyPenalty', opts.settings.frequencyPenalty);
	if (opts.settings.keepAlive) {
		params.keepAlive = opts.settings.keepAlive;
	}
	if (opts.disabledTools.length > 0) {
		params.disabledTools = [...opts.disabledTools];
	}
	if (opts.images && opts.images.length > 0) {
		params.images = opts.images.map(img => {
			const entry: Record<string, string> = { mime: img.mime, data: img.data };
			if (img.relPath) {
				entry.relPath = img.relPath;
			}
			if (img.absPath) {
				entry.absPath = img.absPath;
			}
			return entry;
		});
	}
	if (opts.runObjective) {
		params.runObjective = opts.runObjective;
	}
	if (opts.skipUserTurn) {
		params.skipUserTurn = true;
	}
	if (opts.allowOutsideWorkspace) {
		params.allowOutsideWorkspace = true;
	}
	return params;
}
/** Clés dont la modification exige un redémarrage du processus moteur. */
export const DROX_ENGINE_RESPAWN_SETTINGS: readonly string[] = [
	DroxSetting.Server,
	DroxSetting.ArchitectModel,
	DroxSetting.Model,
	DroxSetting.ApiKey,
	DroxSetting.LlmHeaders,
	DroxSetting.LlmHosting,
	DroxSetting.PrimaryLanguage,
	DroxSetting.ExecutablePath,
	DroxSetting.NumCtx,
	DroxSetting.TopP,
	DroxSetting.TopK,
	DroxSetting.RepeatPenalty,
	DroxSetting.Seed,
	DroxSetting.MinP,
	DroxSetting.PresencePenalty,
	DroxSetting.FrequencyPenalty,
	DroxSetting.KeepAlive,
	DroxSetting.MaxTokens,
];
