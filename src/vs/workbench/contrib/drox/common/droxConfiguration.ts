/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';

import { URI } from '../../../../base/common/uri.js';

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';

import { Registry } from '../../../../platform/registry/common/platform.js';

import { DROX_TOGGLEABLE_TOOL_NAMES, formatToolGroupsForSettingsDescription } from './droxToolGroups.js';



export const enum DroxSetting {

	ExecutablePath = 'drox.executablePath',

	Server = 'drox.server',

	/** Type de serveur LLM local (Ollama pour l'instant). */
	LlmProvider = 'drox.llmProvider',

	/** Modèle Architecte (plan) — ex-modèle principal chat. */
	ArchitectModel = 'drox.architect.model',

	/** Modèle Exécutant (mutations) — ex-modèle sous-agents `task`. */
	ExecutorModel = 'drox.executor.model',

	/** Nombre max d'exécuteurs orchestration en parallèle (`parallel_with`). */
	OrchestrationMaxParallelExecutors = 'drox.orchestration.maxParallelExecutors',

	/** @deprecated Utiliser {@link DroxSetting.ArchitectModel}. */
	Model = 'drox.model',

	/** Mode de permission du chat (Analyze / Trust edit / I'm not crazy). */
	PermissionMode = 'drox.permissionMode',

	ApiKey = 'drox.apiKey',

	PrimaryLanguage = 'drox.primaryLanguage',

	MaxIterations = 'drox.maxIterations',

	NativeThinking = 'drox.nativeThinking',

	Temperature = 'drox.temperature',

	MaxTokens = 'drox.maxTokens',

	NumPredict = 'drox.numPredict',

	NumCtx = 'drox.numCtx',

	TopP = 'drox.topP',

	TopK = 'drox.topK',

	RepeatPenalty = 'drox.repeatPenalty',

	Seed = 'drox.seed',

	MinP = 'drox.minP',

	PresencePenalty = 'drox.presencePenalty',

	FrequencyPenalty = 'drox.frequencyPenalty',

	KeepAlive = 'drox.keepAlive',

	ConfirmFileWrites = 'drox.confirmFileWrites',

	AddDiagnosticOnHover = 'drox.addDiagnosticOnHover',

	OpenModifiedFiles = 'drox.openModifiedFiles',

	WarmStart = 'drox.warmStart',

	/** Afficher erreurs / avertissements moteur dans le fil Drox Chat. */
	ChatShowErrorsAndWarnings = 'drox.chat.showErrorsAndWarnings',

	ToolsDisabled = 'drox.tools.disabled',

	ToolsMcpEnabled = 'drox.tools.mcp.enabled',

	SubagentsEnabled = 'drox.subagents.enabled',

	SubagentsMaxIterations = 'drox.subagents.maxIterations',

	SubagentsMaxConcurrent = 'drox.subagents.maxConcurrent',

	/** @deprecated Utiliser {@link DroxSetting.ExecutorModel}. */
	SubagentsModel = 'drox.subagents.model',

	/** Fenêtre Ollama `num_ctx` des sous-agents (indépendante du modèle principal). */
	SubagentsNumCtx = 'drox.subagents.numCtx',

}

/** Défaut `num_ctx` sous-agents — plus bas que le parent (32k) pour limiter la VRAM à 2 modèles. */
export const DROX_DEFAULT_SUBAGENT_NUM_CTX = 8192;

/** Plafond `drox.orchestration.maxParallelExecutors` (aligné moteur `MAX_PARALLEL_EXECUTORS_CAP`). */
export const DROX_MAX_PARALLEL_EXECUTORS_CAP = 100;

/** Liste dynamique — modèle Architecte (chat + orchestration `v1_2`). */
export const droxArchitectModelEnumValues: string[] = [''];

/** Liste dynamique — modèle Exécutant (orchestration `v1_2` + `task` legacy). */
export const droxExecutorModelEnumValues: string[] = [''];

/** @deprecated Alias enum — garde la rétrocompat settings. */
export const droxLlmModelEnumValues: string[] = droxArchitectModelEnumValues;

/** @deprecated Alias enum. */
export const droxSubagentModelEnumValues: string[] = droxExecutorModelEnumValues;

const droxArchitectModelSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	enum: droxArchitectModelEnumValues,
	default: '',
	scope: ConfigurationScope.RESOURCE,
	markdownDescription: localize(
		'drox.architect.model',
		'**Architect** model for the final orchestration path. Same list as the Drox chat picker — loaded from `drox.server` (reload via ↻ in chat). Replaces the legacy `drox.model` key.',
	),
};

const droxExecutorModelSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	enum: droxExecutorModelEnumValues,
	default: '',
	scope: ConfigurationScope.RESOURCE,
	markdownDescription: localize(
		'drox.executor.model',
		'**Executor** model for delegated execution tasks (`delegate_executor`). Same list as the architect model. **Empty** = reuse the architect model. Parallel tasks share this model (configure concurrency via **Concurrent executor requests** and server `OLLAMA_NUM_PARALLEL`). Replaces the legacy `drox.subagents.model` key.',
	),
};

const droxLegacyModelSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	enum: droxArchitectModelEnumValues,
	default: '',
	scope: ConfigurationScope.RESOURCE,
	markdownDescription: localize(
		'drox.model.deprecated',
		'**Deprecated** — use `drox.architect.model`. Kept for existing workspaces; read as fallback when architect model is empty.',
	),
};

const droxLegacyExecutorModelSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	enum: droxExecutorModelEnumValues,
	default: '',
	scope: ConfigurationScope.RESOURCE,
	markdownDescription: localize(
		'drox.subagents.model.deprecated',
		'**Deprecated** — use `drox.executor.model`. Kept for existing workspaces; read as fallback when executor model is empty.',
	),
};

/** Lit une clé settings avec repli sur les anciennes clés (1.2.0 + pré-rebrand `nexus.drox.*`). */
export function readDroxConfigString(
	configService: IConfigurationService,
	primaryKey: string,
	legacyKey: string,
	resource?: URI,
): string {
	const read = (key: string): string => {
		const v = configService.getValue<string>(key, { resource });
		return typeof v === 'string' ? v.trim() : '';
	};
	const nexusKey = primaryKey.startsWith('drox.')
		? `nexus.drox.${primaryKey.slice('drox.'.length)}`
		: undefined;
	return read(primaryKey) || read(legacyKey) || (nexusKey ? read(nexusKey) : '');
}

export function readArchitectModel(configService: IConfigurationService, resource?: URI): string {
	return readDroxConfigString(configService, DroxSetting.ArchitectModel, DroxSetting.Model, resource);
}

export function readExecutorModel(configService: IConfigurationService, resource?: URI): string {
	const raw = readDroxConfigString(configService, DroxSetting.ExecutorModel, DroxSetting.SubagentsModel, resource);
	// Legacy pool CSV (`m1@ctx,m2@ctx`) → premier modèle uniquement.
	const first = raw.split(',')[0]?.trim() ?? '';
	const head = first.split(';')[0]?.trim() ?? first;
	const at = head.lastIndexOf('@');
	if (at > 0 && at < head.length - 1) {
		const suffix = head.slice(at + 1).trim();
		if (/^\d+$/.test(suffix)) {
			return head.slice(0, at).trim();
		}
	}
	return head;
}

/** Slots parallèles pour `delegate_executor` + `parallel_with` (défaut 1). */
export function readOrchestrationMaxParallelExecutors(
	configService: IConfigurationService,
	resource?: URI,
): number {
	const raw = configService.getValue<number>(DroxSetting.OrchestrationMaxParallelExecutors, { resource });
	const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1;
	return Math.min(DROX_MAX_PARALLEL_EXECUTORS_CAP, Math.max(1, n));
}

export const droxConfigurationNode: IConfigurationNode = {
	id: 'drox',
	title: localize('droxConfigurationTitle', 'Drox'),
	type: 'object',
	properties: {

		[DroxSetting.ExecutablePath]: {

			type: 'string',

			default: '',

			markdownDescription: localize(

				'drox.executablePath',

				'Path to the `drox` executable. When empty, probes `drox-engine/drox/target/{debug,release}/` then `drox` on `PATH`.',

			),

			scope: ConfigurationScope.MACHINE_OVERRIDABLE,

		},

		[DroxSetting.LlmProvider]: {

			type: 'string',

			enum: ['ollama', 'vllm', 'lmstudio'],

			default: 'ollama',

			scope: ConfigurationScope.RESOURCE,

			markdownDescription: localize(

				'drox.llmProvider',

				'LLM server type — determines the models list URL: **Ollama** (`GET /api/tags`), **vLLM** / **LM Studio** (`GET /v1/models`). Same list in settings and chat.',

			),

		},

		[DroxSetting.Server]: {

			type: 'string',

			default: '',

			scope: ConfigurationScope.RESOURCE,

			markdownDescription: localize(

				'drox.server',

				'LLM server base URL. Defaults by provider: Ollama `http://127.0.0.1:11434`, vLLM `http://127.0.0.1:8000`, LM Studio `http://127.0.0.1:1234`. Overrides `DROX_SERVER` from `.drox/.env` when set.',

			),

		},

		[DroxSetting.ArchitectModel]: droxArchitectModelSettingSchema,

		[DroxSetting.ExecutorModel]: droxExecutorModelSettingSchema,

		[DroxSetting.OrchestrationMaxParallelExecutors]: {
			type: 'number',
			default: 1,
			minimum: 1,
			maximum: DROX_MAX_PARALLEL_EXECUTORS_CAP,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'drox.orchestration.maxParallelExecutors',
				'Max concurrent **orchestration Executors** in one `delegate_executor` batch. Default **1** (sequential). Upper bound **{0}** — raise only with disjoint scopes and enough Ollama VRAM (`OLLAMA_NUM_PARALLEL`).',
				DROX_MAX_PARALLEL_EXECUTORS_CAP,
			),
		},

		[DroxSetting.Model]: droxLegacyModelSettingSchema,

		[DroxSetting.PermissionMode]: {

			type: 'string',

			enum: ['analyze', 'trustEdit', 'imNotCrazy'],

			default: 'imNotCrazy',

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(

				'drox.permissionMode',

				'Default Drox chat request mode: **Analyze** (read-only), **Trust edit** (auto-allow edits), or **I\'m not crazy** (confirm each tool). Synced with the vignettes above the composer.',

			),

		},

		[DroxSetting.ApiKey]: {

			type: 'string',

			default: '',

			scope: ConfigurationScope.MACHINE_OVERRIDABLE,

			markdownDescription: localize(

				'drox.apiKey',

				'API key sent as `x-api-key` header. Prefer `.drox/.env` for shared secrets.',

			),

		},

		[DroxSetting.PrimaryLanguage]: {

			type: 'string',

			default: '',

			scope: ConfigurationScope.RESOURCE,

			enum: ['', 'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ja', 'zh', 'ko', 'ru', 'ar', 'pl', 'tr'],

			markdownDescription: localize('drox.primaryLanguage', 'Primary response language. Overrides `DROX_PRIMARY_LANGUAGE`.'),

		},

		[DroxSetting.MaxIterations]: {

			type: 'number',

			default: 12,

			minimum: 1,

			maximum: 200,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.maxIterations', 'Max LLM ↔ tool iterations per `agent.run`.'),

		},

		[DroxSetting.NativeThinking]: {

			type: 'boolean',

			default: false,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.nativeThinking', 'Enable Ollama native thinking (`internal_reasoning` phase).'),

		},

		[DroxSetting.Temperature]: {

			type: 'number',

			default: undefined,

			minimum: 0,

			maximum: 2,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.temperature', 'Sampling temperature. Leave unset for server default.'),

		},

		[DroxSetting.MaxTokens]: {

			type: 'number',

			default: undefined,

			minimum: 1,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.maxTokens', 'Max response tokens per turn.'),

		},

		[DroxSetting.NumPredict]: {

			type: 'number',

			default: 4096,

			minimum: 1,

			maximum: 65536,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.numPredict', 'Ollama `num_predict` (generated tokens cap).'),

		},

		[DroxSetting.NumCtx]: {

			type: 'number',

			default: 32768,

			minimum: 2048,

			maximum: 200000,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.numCtx', 'Ollama `num_ctx` (context window).'),

		},

		[DroxSetting.TopP]: {

			type: 'number',

			default: undefined,

			minimum: 0,

			maximum: 1,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.topP', 'Ollama `top_p`.'),

		},

		[DroxSetting.TopK]: {

			type: 'number',

			default: undefined,

			minimum: 1,

			maximum: 200,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.topK', 'Ollama `top_k`.'),

		},

		[DroxSetting.RepeatPenalty]: {

			type: 'number',

			default: undefined,

			minimum: 0.5,

			maximum: 2,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.repeatPenalty', 'Ollama `repeat_penalty`.'),

		},

		[DroxSetting.Seed]: {

			type: 'number',

			default: undefined,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.seed', 'Ollama `seed` for reproducible sampling.'),

		},

		[DroxSetting.MinP]: {

			type: 'number',

			default: undefined,

			minimum: 0,

			maximum: 1,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.minP', 'Ollama `min_p`.'),

		},

		[DroxSetting.PresencePenalty]: {

			type: 'number',

			default: undefined,

			minimum: -2,

			maximum: 2,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.presencePenalty', 'Ollama `presence_penalty`.'),

		},

		[DroxSetting.FrequencyPenalty]: {

			type: 'number',

			default: undefined,

			minimum: -2,

			maximum: 2,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.frequencyPenalty', 'Ollama `frequency_penalty`.'),

		},

		[DroxSetting.KeepAlive]: {

			type: 'string',

			default: '',

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.keepAlive', 'Ollama `keep_alive` (e.g. `30m`, `0`, `-1`).'),

		},

		[DroxSetting.ConfirmFileWrites]: {

			type: 'boolean',

			default: false,

			scope: ConfigurationScope.RESOURCE,

			description: localize(

				'drox.confirmFileWrites',

				'Ask for confirmation before `file_write` / `file_edit` apply to disk.',

			),

		},

		[DroxSetting.AddDiagnosticOnHover]: {

			type: 'boolean',

			default: false,

			scope: ConfigurationScope.RESOURCE,

			markdownDescription: localize(

				'drox.addDiagnosticOnHover',

				'Show a **Pass to model** link when hovering over editor errors and warnings (in addition to the lightbulb quick fix). Inserts text into the Drox composer without sending automatically.',

			),

		},

		[DroxSetting.OpenModifiedFiles]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.RESOURCE,

			description: localize(

				'drox.openModifiedFiles',

				'Automatically open files in the editor after a successful `file_edit`, `file_write`, or `notebook_edit`. Does not apply to executor deliverables under `.drox/agent-output/` (open them manually from the chat).',

			),

		},

		[DroxSetting.WarmStart]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(

				'drox.warmStart',

				'Pre-spawn `drox --serve` and run the JSON-RPC `initialize` handshake after the workbench restores, so the first chat message avoids cold-start latency.',

			),

		},

		[DroxSetting.ChatShowErrorsAndWarnings]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.RESOURCE,

			markdownDescription: localize(

				'drox.chat.showErrorsAndWarnings',

				'Show **engine errors and warnings** in the Drox chat log (gate blocks, `todo_write` notices, loop interventions, failed tools).',

			),

		},

		[DroxSetting.ToolsDisabled]: {

			type: 'array',

			default: [],

			uniqueItems: true,

			scope: ConfigurationScope.RESOURCE,

			items: {

				type: 'string',

				enum: [...DROX_TOGGLEABLE_TOOL_NAMES],

			},

			markdownDescription: formatToolGroupsForSettingsDescription(),

		},

		[DroxSetting.ToolsMcpEnabled]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.tools.mcp.enabled', 'Expose MCP tools (`mcp__…`) to the model.'),

		},

		[DroxSetting.SubagentsEnabled]: {

			type: 'boolean',

			default: false,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.subagents.enabled', 'Legacy setting (ignored in final orchestration path).'),

		},

		[DroxSetting.SubagentsModel]: droxLegacyExecutorModelSettingSchema,

		[DroxSetting.SubagentsMaxIterations]: {

			type: 'number',

			default: 15,

			minimum: 1,

			maximum: 50,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.subagents.maxIterations', 'Legacy setting (ignored in final orchestration path).'),

		},

		[DroxSetting.SubagentsMaxConcurrent]: {

			type: 'number',

			default: 1,

			minimum: 1,

			maximum: 8,

			scope: ConfigurationScope.RESOURCE,

			description: localize(
				'drox.subagents.maxConcurrent',
				'Legacy setting (ignored in final orchestration path).',
			),

		},

		[DroxSetting.SubagentsNumCtx]: {

			type: 'number',

			default: DROX_DEFAULT_SUBAGENT_NUM_CTX,

			minimum: 2048,

			maximum: 131072,

			scope: ConfigurationScope.RESOURCE,

			description: localize(
				'drox.subagents.numCtx',
				'Legacy setting (ignored in final orchestration path).',
			),

		},

	},

};

export function updateDroxLlmModelEnum(models: readonly string[]): void {
	const values = models.length > 0 ? [...models] : [''];
	droxArchitectModelEnumValues.length = 0;
	droxArchitectModelEnumValues.push(...values);
	droxExecutorModelEnumValues.length = 0;
	droxExecutorModelEnumValues.push(...values);
	droxArchitectModelSettingSchema.enum = droxArchitectModelEnumValues;
	droxExecutorModelSettingSchema.enum = droxExecutorModelEnumValues;
	droxLegacyModelSettingSchema.enum = droxArchitectModelEnumValues;
	droxLegacyExecutorModelSettingSchema.enum = droxExecutorModelEnumValues;

	Registry.as<IConfigurationRegistry>(Extensions.Configuration).notifyConfigurationSchemaUpdated(droxConfigurationNode);
}

export function registerDroxConfiguration(): void {
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(droxConfigurationNode);
}


