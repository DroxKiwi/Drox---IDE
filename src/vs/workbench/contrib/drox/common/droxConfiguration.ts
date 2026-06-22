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

import { createDroxDevConfigurationProperties } from './droxDevConfiguration.js';
import { DROX_DEFAULT_MAX_ITERATIONS, DROX_DEFAULT_NUM_CTX } from './droxProductDefaults.js';
import { DROX_NUM_CTX_MAX, DROX_NUM_CTX_MIN, formatDroxNumCtxLabel } from './droxNumCtx.js';
import { DROX_TOGGLEABLE_TOOL_NAMES, formatToolGroupsForSettingsDescription } from './droxToolGroups.js';



export const enum DroxSetting {

	ExecutablePath = 'drox.executablePath',

	Server = 'drox.server',

	/** Type de serveur LLM local (Ollama pour l'instant). */
	LlmProvider = 'drox.llmProvider',

	/** Hébergement LLM choisi via l'assistant connexion : cloud ou personnel. */
	LlmHosting = 'drox.llmHosting',

	/** Headers HTTP additionnels pour le serveur LLM (paires nom → valeur). */
	LlmHeaders = 'drox.llmHeaders',

	/** Modèle Architecte (plan) — ex-modèle principal chat. */
	ArchitectModel = 'drox.architect.model',

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

	/** @deprecated Lecture seule — repli vers {@link DroxSetting.MaxTokens}. */
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

	UpdateManifestUrl = 'drox.update.manifestUrl',

	UpdateNotifyOnStartup = 'drox.update.notifyOnStartup',

	/** Dev/test only: pretend remote latest is this semver (must be > droxVersion to show prompt). */
	UpdateSimulateLatestVersion = 'drox.update.simulateLatestVersion',

	/** Dev/test only: URL opened by « Installer maintenant » when simulateLatestVersion is set. */
	UpdateSimulateInstallerUrl = 'drox.update.simulateInstallerUrl',

	CycleDoneWindowsNotification = 'drox.notifications.cycleDone.windows',

	/** Notifier aussi lorsque la fenêtre Drox a le focus (sinon : uniquement fenêtre inactive / autre app). */
	CycleDoneWhenFocused = 'drox.notifications.cycleDone.whenFocused',

	/** Afficher erreurs / avertissements moteur dans le fil Drox Chat. */
	ChatShowErrorsAndWarnings = 'drox.chat.showErrorsAndWarnings',

	ToolsDisabled = 'drox.tools.disabled',

	ToolsMcpEnabled = 'drox.tools.mcp.enabled',

}

/** Default `latest.json` URL (also used when user settings clear the manifest URL). */
export const DROX_DEFAULT_UPDATE_MANIFEST_URL =
	'https://raw.githubusercontent.com/DroxKiwi/Drox---IDE---OR/main/stable/latest.json';

/** Liste dynamique — modèle Architecte (`agent.run` / moteur `tui_mono`). */
export const droxArchitectModelEnumValues: string[] = [''];

/** @deprecated Alias enum — garde la rétrocompat settings. */
export const droxLlmModelEnumValues: string[] = droxArchitectModelEnumValues;

const droxArchitectModelSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	enum: droxArchitectModelEnumValues,
	default: '',
	scope: ConfigurationScope.RESOURCE,
	markdownDescription: localize(
		'drox.architect.model',
		'**Architect** LLM for each `agent.run` (`tui_mono` engine). Same list as the chat picker (↻ reloads from `drox.server`). Replaces legacy `drox.model`.',
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

const droxDevConfigurationProperties = createDroxDevConfigurationProperties();

export const droxConfigurationNode: IConfigurationNode = {
	id: 'drox',
	title: localize('droxConfigurationTitle', 'Drox'),
	type: 'object',
	properties: {

		[DroxSetting.LlmProvider]: {

			type: 'string',

			enum: ['ollama', 'vllm', 'lmstudio', 'huggingface', 'mistral', 'openai_compatible'],

			default: 'ollama',

			scope: ConfigurationScope.RESOURCE,

			markdownDescription: localize(

				'drox.llmProvider',

				'LLM server type — determines the models list URL: **Ollama** (`GET /api/tags`), **vLLM** / **LM Studio** (`GET /v1/models`). Same list in settings and chat.',

			),

		},

		[DroxSetting.LlmHosting]: {
			type: 'string',
			enum: ['', 'cloud', 'personal'],
			default: '',
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'drox.llmHosting',
				'LLM hosting mode set by the **Connect your AI** wizard: **cloud** (managed provider) or **personal** (self-hosted server).',
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

		[DroxSetting.LlmHeaders]: {
			type: 'object',
			default: {},
			additionalProperties: { type: 'string' },
			scope: ConfigurationScope.MACHINE_OVERRIDABLE,
			markdownDescription: localize(
				'drox.llmHeaders',
				'Additional HTTP headers for the LLM server (e.g. `Authorization`, custom API keys). Set via the connection wizard.',
			),
		},

		[DroxSetting.ArchitectModel]: droxArchitectModelSettingSchema,

		[DroxSetting.NumCtx]: {
			type: 'number',
			default: DROX_DEFAULT_NUM_CTX,
			minimum: DROX_NUM_CTX_MIN,
			maximum: DROX_NUM_CTX_MAX,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'drox.numCtx',
				'**Context window** — `numCtx` in `agent.run` (Ollama `num_ctx`). Presets 16k–1M or a custom value ({0}–{1} tokens); larger values use more VRAM.',
				formatDroxNumCtxLabel(DROX_NUM_CTX_MIN),
				formatDroxNumCtxLabel(DROX_NUM_CTX_MAX),
			),
		},

		[DroxSetting.Temperature]: {
			type: 'number',
			default: undefined,
			minimum: 0,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.temperature', 'Sampling temperature (`temperature` in `agent.run`). Leave unset for server default.'),
		},
		[DroxSetting.TopP]: {
			type: 'number',
			default: undefined,
			minimum: 0,
			maximum: 1,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.topP', 'Top-p (`topP` in `agent.run`). Leave unset for server default.'),
		},
		[DroxSetting.TopK]: {
			type: 'number',
			default: undefined,
			minimum: 1,
			maximum: 200,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.topK', 'Top-k (`topK` in `agent.run`). Leave unset for server default.'),
		},
		[DroxSetting.RepeatPenalty]: {
			type: 'number',
			default: undefined,
			minimum: 0.5,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.repeatPenalty', 'Repeat penalty (`repeatPenalty` in `agent.run`). Leave unset for server default.'),
		},
		[DroxSetting.MinP]: {
			type: 'number',
			default: undefined,
			minimum: 0,
			maximum: 1,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.minP', 'Min-p (`minP` in `agent.run`). Leave unset for server default.'),
		},
		[DroxSetting.Seed]: {
			type: 'number',
			default: undefined,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.seed', 'Sampling seed (`seed` in `agent.run`). Leave unset for server default.'),
		},
		[DroxSetting.PresencePenalty]: {
			type: 'number',
			default: undefined,
			minimum: -2,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.presencePenalty', 'Presence penalty (`presencePenalty` in `agent.run`) when supported by the backend.'),
		},
		[DroxSetting.FrequencyPenalty]: {
			type: 'number',
			default: undefined,
			minimum: -2,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.frequencyPenalty', 'Frequency penalty (`frequencyPenalty` in `agent.run`) when supported by the backend.'),
		},
		[DroxSetting.MaxTokens]: {
			type: 'number',
			default: undefined,
			minimum: 1,
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.maxTokens', 'Max response tokens per turn (`maxTokens` in `agent.run`).'),
		},
		[DroxSetting.KeepAlive]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.RESOURCE,
			description: localize('drox.keepAlive', 'Ollama `keepAlive` in `agent.run` (e.g. `30m`, `0`, `-1`). Leave empty for server default.'),
		},

		[DroxSetting.MaxIterations]: {
			type: 'number',
			default: DROX_DEFAULT_MAX_ITERATIONS,
			minimum: 1,
			maximum: 200,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'drox.maxIterations',
				'**Max iterations** — maximum LLM ↔ tool turns per `agent.run`.',
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

		[DroxSetting.NativeThinking]: {

			type: 'boolean',

			default: false,

			scope: ConfigurationScope.RESOURCE,

			description: localize('drox.nativeThinking', 'Enable native thinking (`nativeThinking` in `agent.run`, Ollama `internal_reasoning` phase).'),

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
				'Automatically open files in the editor after a successful `file_edit`, `file_write`, or `notebook_edit`.',
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

		[DroxSetting.UpdateManifestUrl]: {

			type: 'string',

			default: DROX_DEFAULT_UPDATE_MANIFEST_URL,

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(
				'drox.update.manifestUrl',
				'URL of the Drox update manifest (`latest.json`). Used to detect updates from the installed app.',
			),

		},

		[DroxSetting.UpdateNotifyOnStartup]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(
				'drox.update.notifyOnStartup',
				'Check for Drox updates at startup and show a notification when a newer version is available.',
			),

		},

		[DroxSetting.CycleDoneWindowsNotification]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(
				'drox.notifications.cycleDone.windows',
				'Notify when an `agent.run` finishes (`agent/done`). Uses a workbench banner and, when the window is inactive, a system toast (Windows).',
			),

		},

		[DroxSetting.CycleDoneWhenFocused]: {

			type: 'boolean',

			default: false,

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(
				'drox.notifications.cycleDone.whenFocused',
				'Also show the workbench notification while this window is focused (system toast stays disabled until you switch away).',
			),

		},

		[DroxSetting.ChatShowErrorsAndWarnings]: {

			type: 'boolean',

			default: true,

			scope: ConfigurationScope.RESOURCE,

			markdownDescription: localize(
				'drox.chat.showErrorsAndWarnings',
				'Show **engine errors and warnings** in the Drox chat log (gate blocks, tool notices, loop interventions, failed tools).',
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

		...droxDevConfigurationProperties,

	},

};

export function updateDroxLlmModelEnum(models: readonly string[]): void {
	const values = models.length > 0 ? [...models] : [''];
	droxArchitectModelEnumValues.length = 0;
	droxArchitectModelEnumValues.push(...values);
	droxArchitectModelSettingSchema.enum = droxArchitectModelEnumValues;
	droxLegacyModelSettingSchema.enum = droxArchitectModelEnumValues;

	Registry.as<IConfigurationRegistry>(Extensions.Configuration).notifyConfigurationSchemaUpdated(droxConfigurationNode);
}

export function registerDroxConfiguration(): void {
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(droxConfigurationNode);
}


