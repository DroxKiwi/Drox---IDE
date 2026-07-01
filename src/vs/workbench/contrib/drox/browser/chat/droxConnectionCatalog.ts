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
import {
	DROX_CLOUD_PROVIDER_SPECS,
	type IDroxCloudProviderSpec,
} from "../../common/droxCloudConnectionRegistry.js";

export type DroxLlmHosting = "" | "cloud" | "personal";

export interface IDroxConnectionProviderDef {
	readonly id: DroxLlmProviderId;
	readonly label: string;
	readonly description: string;
	readonly defaultServer: string;
}

export type IDroxCloudProviderDef = IDroxCloudProviderSpec;

export const DROX_PERSONAL_CONNECTION_PROVIDERS: readonly IDroxConnectionProviderDef[] =
	[
		{
			id: "ollama",
			label: "Ollama",
			description: "Serveur Ollama local ou distant",
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
			description: "Serveur LM Studio local",
			defaultServer: DROX_DEFAULT_LLM_SERVER.lmstudio,
		},
		{
			id: "openai_compatible",
			label: "API OpenAI-compatible",
			description: "Tout serveur exposant /v1/chat/completions",
			defaultServer: "",
		},
	];

/** Catalogue cloud — voir `droxCloudConnectionRegistry.ts` (source unique). */
export const DROX_CLOUD_CONNECTION_PROVIDERS: readonly IDroxCloudProviderSpec[] =
	DROX_CLOUD_PROVIDER_SPECS;

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
