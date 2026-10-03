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
import {
	liveDroxLlmParamValue,
	normalizeDroxLlmParamsMuted,
	type DroxLlmMuteableParamKey,
} from './droxLlmParamMute.js';
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
	readonly reasoningEffort: string;
	readonly thinkingBudget: number | undefined;
	readonly nativeThinking: boolean;
	/** Keys muted in the model panel — omitted from wire even if values are set. */
	readonly llmParamsMuted: readonly DroxLlmMuteableParamKey[];
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
		reasoningEffort: str(DroxSetting.ReasoningEffort).trim(),
		thinkingBudget: num(DroxSetting.ThinkingBudget),
		nativeThinking: bool(DroxSetting.NativeThinking, false),
		llmParamsMuted: normalizeDroxLlmParamsMuted(
			readDroxChatConfigurationValue<unknown>(configService, DroxSetting.LlmParamsMuted, resource),
		),
	};
}
export function llmSettingsToEnv(settings: IDroxLlmSettings): Record<string, string> {
	const muted = settings.llmParamsMuted;
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
	const maxOut = liveDroxLlmParamValue(muted, 'maxTokens', effectiveMaxTokensForRun(settings));
	if (maxOut !== undefined) {
		env.DROX_NUM_PREDICT = String(maxOut);
	}
	const numCtx = liveDroxLlmParamValue(muted, 'numCtx', settings.numCtx);
	if (numCtx !== undefined && numCtx > 0) {
		env.DROX_NUM_CTX = String(Math.floor(numCtx));
	}
	const topP = liveDroxLlmParamValue(muted, 'topP', settings.topP);
	if (topP !== undefined) {
		env.DROX_TOP_P = String(topP);
	}
	const topK = liveDroxLlmParamValue(muted, 'topK', settings.topK);
	if (topK !== undefined && topK > 0) {
		env.DROX_TOP_K = String(Math.floor(topK));
	}
	const repeatPenalty = liveDroxLlmParamValue(muted, 'repeatPenalty', settings.repeatPenalty);
	if (repeatPenalty !== undefined) {
		env.DROX_REPEAT_PENALTY = String(repeatPenalty);
	}
	const seed = liveDroxLlmParamValue(muted, 'seed', settings.seed);
	if (seed !== undefined) {
		env.DROX_SEED = String(Math.floor(seed));
	}
	const minP = liveDroxLlmParamValue(muted, 'minP', settings.minP);
	if (minP !== undefined) {
		env.DROX_MIN_P = String(minP);
	}
	const presencePenalty = liveDroxLlmParamValue(muted, 'presencePenalty', settings.presencePenalty);
	if (presencePenalty !== undefined) {
		env.DROX_PRESENCE_PENALTY = String(presencePenalty);
	}
	const frequencyPenalty = liveDroxLlmParamValue(muted, 'frequencyPenalty', settings.frequencyPenalty);
	if (frequencyPenalty !== undefined) {
		env.DROX_FREQUENCY_PENALTY = String(frequencyPenalty);
	}
	const keepAlive = liveDroxLlmParamValue(muted, 'keepAlive', settings.keepAlive || undefined);
	if (keepAlive) {
		env.DROX_KEEP_ALIVE = keepAlive;
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

export interface IDroxSubagentsRunSettings {
	readonly enabled: boolean;
	readonly maxIterations: number;
	readonly maxConcurrent: number;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
	const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
	return Math.min(max, Math.max(min, n));
}

/** Settings for Explore (`task`) — master kill-switch + per-run ceilings. */
export function readSubagentsSettings(configService: IConfigurationService, resource?: URI): IDroxSubagentsRunSettings {
	const enabled = readDroxChatConfigurationValue<boolean>(configService, DroxSetting.SubagentsEnabled, resource) === true;
	const maxIterations = clampInt(
		readDroxChatConfigurationValue<number>(configService, DroxSetting.SubagentsMaxIterations, resource),
		15,
		1,
		50,
	);
	const maxConcurrent = clampInt(
		readDroxChatConfigurationValue<number>(configService, DroxSetting.SubagentsMaxConcurrent, resource),
		1,
		1,
		8,
	);
	return { enabled, maxIterations, maxConcurrent };
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
	/** Préfixe system IDE (ex. carnet session N0) — fusionné côté moteur avec memdir. */
	readonly system?: string;
	/** Explore sub-agents (`task`) — when `enabled`, wires `subagentsEnabled` + ceilings. */
	readonly subagents?: IDroxSubagentsRunSettings;
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
	if (opts.system?.trim()) {
		params.system = opts.system.trim();
	}
	if (opts.settings.server) {
		params.server = opts.settings.server;
	}
	if (opts.settings.model) {
		params.model = opts.settings.model;
	}
	params.provider = opts.settings.llmProvider;
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
	const muted = opts.settings.llmParamsMuted;
	wireOptionalNumber(params, 'temperature', liveDroxLlmParamValue(muted, 'temperature', opts.settings.temperature));
	const maxTokens = liveDroxLlmParamValue(muted, 'maxTokens', effectiveMaxTokensForRun(opts.settings));
	wireOptionalPositiveInt(params, 'maxTokens', maxTokens);
	wireOptionalPositiveInt(params, 'numCtx', liveDroxLlmParamValue(muted, 'numCtx', opts.settings.numCtx));
	wireOptionalNumber(params, 'topP', liveDroxLlmParamValue(muted, 'topP', opts.settings.topP));
	wireOptionalPositiveInt(params, 'topK', liveDroxLlmParamValue(muted, 'topK', opts.settings.topK));
	wireOptionalNumber(params, 'repeatPenalty', liveDroxLlmParamValue(muted, 'repeatPenalty', opts.settings.repeatPenalty));
	wireOptionalNumber(params, 'minP', liveDroxLlmParamValue(muted, 'minP', opts.settings.minP));
	const seed = liveDroxLlmParamValue(muted, 'seed', opts.settings.seed);
	if (seed !== undefined) {
		params.seed = Math.floor(seed);
	}
	wireOptionalNumber(params, 'presencePenalty', liveDroxLlmParamValue(muted, 'presencePenalty', opts.settings.presencePenalty));
	wireOptionalNumber(params, 'frequencyPenalty', liveDroxLlmParamValue(muted, 'frequencyPenalty', opts.settings.frequencyPenalty));
	const keepAlive = liveDroxLlmParamValue(muted, 'keepAlive', opts.settings.keepAlive || undefined);
	if (keepAlive) {
		params.keepAlive = keepAlive;
	}
	const reasoningEffort = liveDroxLlmParamValue(muted, 'reasoningEffort', opts.settings.reasoningEffort || undefined);
	if (reasoningEffort) {
		params.reasoningEffort = reasoningEffort;
	}
	wireOptionalPositiveInt(params, 'thinkingBudget', liveDroxLlmParamValue(muted, 'thinkingBudget', opts.settings.thinkingBudget));
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
	if (opts.subagents?.enabled) {
		params.subagentsEnabled = true;
		params.subagentsMaxIterations = opts.subagents.maxIterations;
		params.subagentsMaxConcurrent = opts.subagents.maxConcurrent;
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
	DroxSetting.ReasoningEffort,
	DroxSetting.ThinkingBudget,
	DroxSetting.MaxTokens,
];
