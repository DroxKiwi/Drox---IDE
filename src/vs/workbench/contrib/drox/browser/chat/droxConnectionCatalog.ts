/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	IDroxGeneralSettingsPatch,
	IDroxGeneralSettingsWire,
} from "./droxChatGeneralSettings.js";
import { DroxSetting } from "../../common/droxConfiguration.js";
import {
	DROX_DEFAULT_LLM_SERVER,
	DroxLlmProviderId,
} from "../../common/droxLlmCatalog.js";

export type DroxLlmHosting = "" | "cloud" | "personal";

export interface IDroxConnectionProviderDef {
	readonly id: DroxLlmProviderId;
	readonly label: string;
	readonly description: string;
	readonly defaultServer: string;
}

export interface IDroxCloudProviderFormField {
	readonly id: string;
	readonly label: string;
	readonly type: "text" | "password" | "url";
	readonly placeholder?: string;
	readonly required?: boolean;
	/** Stocke dans `apiKey` plutôt que dans les headers. */
	readonly mapsToApiKey?: boolean;
	/** Stocke dans `server`. */
	readonly mapsToServer?: boolean;
	/** Stocke dans `llmHeaders[headerName]` ; `headerPrefix` est préfixé à la valeur. */
	readonly mapsToHeader?: string;
	readonly headerPrefix?: string;
}

export interface IDroxCloudProviderDef extends IDroxConnectionProviderDef {
	readonly fields: readonly IDroxCloudProviderFormField[];
}

export const DROX_PERSONAL_CONNECTION_PROVIDERS: readonly IDroxConnectionProviderDef[] =
	[
		{
			id: "ollama",
			label: "Ollama",
			description: "Local or remote Ollama server",
			defaultServer: DROX_DEFAULT_LLM_SERVER.ollama,
		},
		{
			id: "vllm",
			label: "vLLM",
			description: "API OpenAI-compatible (vLLM)",
			defaultServer: DROX_DEFAULT_LLM_SERVER.vllm,
		},
		{
			id: "lmstudio",
			label: "LM Studio",
			description: "Local LM Studio server",
			defaultServer: DROX_DEFAULT_LLM_SERVER.lmstudio,
		},
		{
			id: "openai_compatible",
			label: "API OpenAI-compatible",
			description: "Any server exposing /v1/chat/completions",
			defaultServer: "",
		},
	];

export const DROX_CLOUD_CONNECTION_PROVIDERS: readonly IDroxCloudProviderDef[] =
	[
		{
			id: "huggingface",
			label: "Hugging Face",
			description: "Inference API (router OpenAI-compatible)",
			defaultServer: DROX_DEFAULT_LLM_SERVER.huggingface,
			fields: [
				{
					id: "hfToken",
					label: "Token Hugging Face",
					type: "password",
					placeholder: "hf_…",
					required: true,
					mapsToHeader: "Authorization",
					headerPrefix: "Bearer ",
				},
			],
		},
		{
			id: "mistral",
			label: "Mistral AI",
			description: "Mistral cloud API",
			defaultServer: DROX_DEFAULT_LLM_SERVER.mistral,
			fields: [
				{
					id: "mistralKey",
					label: "Mistral API key",
					type: "password",
					required: true,
					mapsToHeader: "Authorization",
					headerPrefix: "Bearer ",
				},
			],
		},
		{
			id: "ollama",
			label: "Ollama (distant)",
			description: "Hosted Ollama instance (URL + optional key)",
			defaultServer: "",
			fields: [
				{
					id: "remoteUrl",
					label: "Server URL",
					type: "url",
					placeholder: "https://ollama.example.com",
					required: true,
					mapsToServer: true,
				},
				{
					id: "remoteKey",
					label: "API key (optional)",
					type: "password",
					mapsToApiKey: true,
				},
			],
		},
	];

export function normalizeDroxLlmHosting(value: unknown): DroxLlmHosting {
	if (value === "cloud" || value === "personal") {
		return value;
	}
	return "";
}

export function formatDroxConnectionSummary(
	settings: Pick<
		IDroxGeneralSettingsWire,
		"llmHosting" | "llmProvider" | "server"
	>,
): string {
	const hosting = normalizeDroxLlmHosting(settings.llmHosting);
	const provider = settings.llmProvider || "ollama";
	const all = [
		...DROX_PERSONAL_CONNECTION_PROVIDERS,
		...DROX_CLOUD_CONNECTION_PROVIDERS,
	];
	const def = all.find((p) => p.id === provider);
	const providerLabel = def?.label ?? provider;
	const hostLabel =
		hosting === "cloud" ? "Cloud" : hosting === "personal" ? "Self-hosted" : "";
	const server = String(settings.server || "")
		.replace(/^https?:\/\//, "")
		.slice(0, 28);
	const parts = [hostLabel, providerLabel, server].filter(Boolean);
	return parts.length ? parts.join(" · ") : "Not configured";
}

export function connectionPatchFromWizard(draft: {
	readonly llmHosting: DroxLlmHosting;
	readonly llmProvider: string;
	readonly server: string;
	readonly apiKey: string;
	readonly llmHeaders: Record<string, string>;
}): IDroxGeneralSettingsPatch {
	return {
		llmHosting: draft.llmHosting,
		llmProvider: draft.llmProvider,
		server: draft.server.trim(),
		apiKey: draft.apiKey.trim(),
		llmHeaders: { ...draft.llmHeaders },
	};
}

export const DROX_CONNECTION_SETTING_KEYS: readonly string[] = [
	DroxSetting.LlmHosting,
	DroxSetting.LlmProvider,
	DroxSetting.Server,
	DroxSetting.ApiKey,
	DroxSetting.LlmHeaders,
];
