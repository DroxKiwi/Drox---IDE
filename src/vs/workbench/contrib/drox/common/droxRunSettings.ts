/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting, readArchitectModel } from './droxConfiguration.js';
import { isDroxDevFeatureEnabled } from './droxDevSurface.js';
import { DROX_DEFAULT_MAX_ITERATIONS, DROX_DEFAULT_NUM_CTX, DROX_DEFAULT_NUM_PREDICT } from './droxProductDefaults.js';
import { normalizeDroxNumCtx } from './droxNumCtx.js';
import product from '../../../../platform/product/common/product.js';
import { IDroxAgentRunImage } from './droxAttachments.js';
import { getDisabledToolNames } from './droxToolCatalog.js';
import {
	DroxArchitectInteractionMode,
	normalizeDroxArchitectInteractionMode,
	wireArchitectInteractionMode,
} from './droxArchitectInteractionMode.js';
import { DroxPermissionMode, normalizeDroxPermissionMode } from './droxPermissionAsk.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';
export interface IDroxLlmSettings {
	readonly server: string;
	readonly model: string;
	readonly apiKey: string;
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
function readNumber(configService: IConfigurationService, key: string, resource: URI | undefined): number | undefined {
	const v = configService.getValue<unknown>(key, { resource });
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
export function readPermissionMode(configService: IConfigurationService, resource?: URI): DroxPermissionMode {
	const v = configService.getValue<string>(DroxSetting.PermissionMode, { resource });
	return normalizeDroxPermissionMode(v);
}
export function readArchitectInteractionMode(
	configService: IConfigurationService,
	resource?: URI,
): DroxArchitectInteractionMode {
	const v = configService.getValue<string>(DroxSetting.ArchitectInteractionMode, { resource });
	return normalizeDroxArchitectInteractionMode(v);
}
function readOptionalNumber(
	configService: IConfigurationService,
	key: string,
	resource: URI | undefined,
): number | undefined {
	if (!isDroxDevFeatureEnabled('advancedLlmSettings', product)) {
		return undefined;
	}
	return readNumber(configService, key, resource);
}
export function readLlmSettings(configService: IConfigurationService, resource?: URI): IDroxLlmSettings {
	const str = (key: string): string => {
		const v = configService.getValue<string>(key, { resource });
		return typeof v === 'string' ? v.trim() : '';
	};
	const advanced = isDroxDevFeatureEnabled('advancedLlmSettings', product);
	return {
		server: str(DroxSetting.Server),
		model: readArchitectModel(configService, resource),
		apiKey: str(DroxSetting.ApiKey),
		primaryLanguage: str(DroxSetting.PrimaryLanguage),
		maxIterations: advanced
			? (configService.getValue<number>(DroxSetting.MaxIterations, { resource }) ?? DROX_DEFAULT_MAX_ITERATIONS)
			: DROX_DEFAULT_MAX_ITERATIONS,
		temperature: readOptionalNumber(configService, DroxSetting.Temperature, resource),
		maxTokens: readOptionalNumber(configService, DroxSetting.MaxTokens, resource),
		numPredict: advanced
			? (readNumber(configService, DroxSetting.NumPredict, resource) ?? DROX_DEFAULT_NUM_PREDICT)
			: DROX_DEFAULT_NUM_PREDICT,
		numCtx: normalizeDroxNumCtx(readNumber(configService, DroxSetting.NumCtx, resource) ?? DROX_DEFAULT_NUM_CTX),
		topP: readOptionalNumber(configService, DroxSetting.TopP, resource),
		topK: readOptionalNumber(configService, DroxSetting.TopK, resource),
		repeatPenalty: readOptionalNumber(configService, DroxSetting.RepeatPenalty, resource),
		seed: readOptionalNumber(configService, DroxSetting.Seed, resource),
		minP: readOptionalNumber(configService, DroxSetting.MinP, resource),
		presencePenalty: readOptionalNumber(configService, DroxSetting.PresencePenalty, resource),
		frequencyPenalty: readOptionalNumber(configService, DroxSetting.FrequencyPenalty, resource),
		keepAlive: advanced ? str(DroxSetting.KeepAlive) : '',
		nativeThinking: configService.getValue<boolean>(DroxSetting.NativeThinking, { resource }) ?? false,
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
	if (settings.numPredict !== undefined && settings.numPredict > 0) {
		env.DROX_NUM_PREDICT = String(Math.floor(settings.numPredict));
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
	const raw = configService.getValue<string[]>(DroxSetting.ToolsDisabled, { resource }) ?? [];
	return [...getDisabledToolNames(raw)].sort();
}
export function isMcpToolsEnabled(configService: IConfigurationService, resource?: URI): boolean {
	return configService.getValue<boolean>(DroxSetting.ToolsMcpEnabled, { resource }) !== false;
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
	readonly architectInteractionMode?: DroxArchitectInteractionMode;
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
	if (opts.settings.apiKey) {
		params.apiKey = opts.settings.apiKey;
	}
	if (opts.settings.temperature !== undefined) {
		params.temperature = opts.settings.temperature;
	}
	if (opts.settings.maxTokens !== undefined) {
		params.maxTokens = opts.settings.maxTokens;
	}
	if (opts.settings.numCtx !== undefined && opts.settings.numCtx > 0) {
		params.numCtx = Math.floor(opts.settings.numCtx);
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
	params.orchestrationMode = 'role_split';
	params.orchestrationMaxParallelExecutors = 1;
	const architectGate = wireArchitectInteractionMode(
		opts.architectInteractionMode ?? 'auto',
	);
	if (architectGate) {
		params.architectInteractionMode = architectGate;
	}
	return params;
}
/** Clés dont la modification exige un redémarrage du processus moteur. */
export const DROX_ENGINE_RESPAWN_SETTINGS: readonly string[] = [
	DroxSetting.Server,
	DroxSetting.ArchitectModel,
	DroxSetting.Model,
	DroxSetting.ApiKey,
	DroxSetting.PrimaryLanguage,
	DroxSetting.ExecutablePath,
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
];
