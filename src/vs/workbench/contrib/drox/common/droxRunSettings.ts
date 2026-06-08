/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DROX_DEFAULT_SUBAGENT_NUM_CTX, DroxSetting, readArchitectModel, readExecutorModel } from './droxConfiguration.js';
import { IDroxAgentRunImage } from './droxAttachments.js';
import { getDisabledToolNames } from './droxToolCatalog.js';
import {
	DroxArchitectInteractionMode,
	normalizeDroxArchitectInteractionMode,
	wireArchitectInteractionMode,
} from './droxArchitectInteractionMode.js';
import {
	DROX_DEFAULT_ENGINE_STRICTNESS,
	DroxEngineStrictnessPreset,
	wireEngineStrictnessForRpc,
} from './droxEngineStrictness.js';
import { wireEngineTuningForRpc } from './droxEngineTuning.js';
import { isExecutorDelegationUiEnabled } from './droxOrchestrationUi.js';
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
export interface IDroxSubagentSettings {
	readonly enabled: boolean;
	readonly maxIterations: number;
	readonly maxConcurrent: number;
	/** Vide = même modèle que l'architecte (`drox.executor.model`). CSV accepté (`m1,m2,...`) pour un pool exécuteur. */
	readonly model: string;
	/** Fenêtre Ollama `num_ctx` du sous-modèle (≠ `drox.numCtx`). */
	readonly numCtx: number;
}
export { DROX_DEFAULT_SUBAGENT_NUM_CTX };
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
export function readLlmSettings(configService: IConfigurationService, resource?: URI): IDroxLlmSettings {
	const str = (key: string): string => {
		const v = configService.getValue<string>(key, { resource });
		return typeof v === 'string' ? v.trim() : '';
	};
	return {
		server: str(DroxSetting.Server),
		model: readArchitectModel(configService, resource),
		apiKey: str(DroxSetting.ApiKey),
		primaryLanguage: str(DroxSetting.PrimaryLanguage),
		maxIterations: configService.getValue<number>(DroxSetting.MaxIterations, { resource }) ?? 12,
		temperature: readNumber(configService, DroxSetting.Temperature, resource),
		maxTokens: readNumber(configService, DroxSetting.MaxTokens, resource),
		numPredict: readNumber(configService, DroxSetting.NumPredict, resource),
		numCtx: readNumber(configService, DroxSetting.NumCtx, resource),
		topP: readNumber(configService, DroxSetting.TopP, resource),
		topK: readNumber(configService, DroxSetting.TopK, resource),
		repeatPenalty: readNumber(configService, DroxSetting.RepeatPenalty, resource),
		seed: readNumber(configService, DroxSetting.Seed, resource),
		minP: readNumber(configService, DroxSetting.MinP, resource),
		presencePenalty: readNumber(configService, DroxSetting.PresencePenalty, resource),
		frequencyPenalty: readNumber(configService, DroxSetting.FrequencyPenalty, resource),
		keepAlive: str(DroxSetting.KeepAlive),
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
/** Variables d'environnement pour les sous-agents (spawn moteur, secours si RPC absent). */
export function subagentSettingsToEnv(subagents: IDroxSubagentSettings): Record<string, string> {
	const env: Record<string, string> = {};
	if (subagents.enabled && subagents.numCtx > 0) {
		env.DROX_SUBAGENTS_NUM_CTX = String(Math.floor(subagents.numCtx));
	}
	return env;
}
export function readSubagentSettings(configService: IConfigurationService, resource?: URI): IDroxSubagentSettings {
	const maxIterations = configService.getValue<number>(DroxSetting.SubagentsMaxIterations, { resource }) ?? 15;
	const maxConcurrent = configService.getValue<number>(DroxSetting.SubagentsMaxConcurrent, { resource }) ?? 1;
	const modelRaw = readExecutorModel(configService, resource);
	const numCtxRaw = configService.getValue<number>(DroxSetting.SubagentsNumCtx, { resource }) ?? DROX_DEFAULT_SUBAGENT_NUM_CTX;
	return {
		enabled: configService.getValue<boolean>(DroxSetting.SubagentsEnabled, { resource }) === true,
		maxIterations: Math.min(50, Math.max(1, maxIterations)),
		maxConcurrent: Math.min(8, Math.max(1, maxConcurrent)),
		model: modelRaw,
		numCtx: Math.min(131_072, Math.max(2048, Math.floor(numCtxRaw))),
	};
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
	readonly subagents: IDroxSubagentSettings;
	readonly mcpToolsEnabled: boolean;
	readonly images?: readonly IDroxAgentRunImage[];
	readonly runObjective?: string;
	readonly orchestrationMaxParallelExecutors?: number;
	readonly architectInteractionMode?: DroxArchitectInteractionMode;
	readonly engineStrictness?: DroxEngineStrictnessPreset;
	readonly configService?: IConfigurationService;
	readonly configResource?: URI;
}): Record<string, unknown> {
	const params: Record<string, unknown> = {
		prompt: opts.prompt,
		workspace: opts.workspace,
		mode: opts.mode,
		applyEdits: opts.mode !== 'professor',
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
	const executorDelegationUi = isExecutorDelegationUiEnabled();
	if (executorDelegationUi && opts.subagents.model) {
		params.subagentsModel = opts.subagents.model;
	}
	const executorSameAsArchitect = !opts.subagents.model?.trim();
	let executorNumCtx: number | undefined;
	if (executorDelegationUi) {
		executorNumCtx =
			executorSameAsArchitect &&
				opts.settings.numCtx !== undefined &&
				opts.settings.numCtx > 0
				? Math.floor(opts.settings.numCtx)
				: opts.subagents.numCtx > 0
					? Math.floor(opts.subagents.numCtx)
					: undefined;
	}
	if (executorNumCtx !== undefined) {
		params.subagentsNumCtx = executorNumCtx;
	}
	if (opts.subagents.enabled) {
		params.subagentsEnabled = true;
		params.subagentsMaxIterations = opts.subagents.maxIterations;
		params.subagentsMaxConcurrent = opts.subagents.maxConcurrent;
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
	// Chemin produit final : orchestration architecte/executor unique.
	params.orchestrationMode = 'role_split';
	delete params.subagentsEnabled;
	delete params.subagentsMaxIterations;
	delete params.subagentsMaxConcurrent;
	// Solo 1.3.4 : pas de sub-agents — le moteur force parallel_slots = 1.
	params.orchestrationMaxParallelExecutors = executorDelegationUi
		? (opts.orchestrationMaxParallelExecutors ?? 1)
		: 1;
	const architectGate = wireArchitectInteractionMode(
		opts.architectInteractionMode ?? 'auto',
	);
	if (architectGate) {
		params.architectInteractionMode = architectGate;
	}
	const strictness = opts.engineStrictness ?? DROX_DEFAULT_ENGINE_STRICTNESS;
	params.engineStrictness = wireEngineStrictnessForRpc(strictness);
	if (opts.configService) {
		const tuning = wireEngineTuningForRpc(
			strictness,
			opts.configService,
			opts.configResource,
		);
		if (tuning) {
			params.engineTuning = tuning;
		}
	}
	if (!executorDelegationUi && strictness === 'custom') {
		const tuning = (params.engineTuning ?? {}) as Record<string, unknown>;
		tuning.executorDelegationEnabled = false;
		params.engineTuning = tuning;
	}
	return params;
}
/** Clés dont la modification exige un redémarrage du processus moteur. */
export const DROX_ENGINE_RESPAWN_SETTINGS: readonly string[] = [
	DroxSetting.Server,
	DroxSetting.ArchitectModel,
	DroxSetting.ExecutorModel,
	DroxSetting.Model,
	DroxSetting.SubagentsModel,
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
	DroxSetting.SubagentsNumCtx,
];
