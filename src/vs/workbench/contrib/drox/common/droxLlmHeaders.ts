/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';
import { readDroxChatConfigurationValue } from './droxAgentsConfiguration.js';
import { DroxLlmProviderId } from './droxLlmCatalog.js';
import { DROX_OLLAMA_CLOUD_SERVER, isCloudBearerProvider } from './droxCloudConnectionRegistry.js';

export type DroxLlmHeadersMap = Readonly<Record<string, string>>;

export interface IDroxLlmAuthContext {
	readonly provider?: DroxLlmProviderId;
	readonly server?: string;
}

export { DROX_OLLAMA_CLOUD_SERVER };

export function readLlmHeadersMap(
	configService: IConfigurationService,
	resource?: URI,
): Record<string, string> {
	const raw = readDroxChatConfigurationValue<unknown>(configService, DroxSetting.LlmHeaders, resource);
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const name = String(key).trim();
		if (!name || value === undefined || value === null) {
			continue;
		}
		const v = String(value).trim();
		if (v) {
			out[name] = v;
		}
	}
	return out;
}

function hasAuthorizationHeader(headers: DroxLlmHeadersMap): boolean {
	return Object.keys(headers).some(name => name.toLowerCase() === 'authorization');
}

/** Hôte Ollama Cloud officiel (`ollama.com` et sous-domaines). */
export function isOllamaCloudServer(server: string | undefined): boolean {
	const raw = String(server ?? '').trim();
	if (!raw) {
		return false;
	}
	try {
		const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
		const host = u.hostname.toLowerCase();
		return host === 'ollama.com' || host.endsWith('.ollama.com');
	} catch {
		return false;
	}
}

/** Cloud documenté : Authorization Bearer (jamais x-api-key générique). */
export function usesBearerApiKeyAuth(context?: IDroxLlmAuthContext): boolean {
	const provider = context?.provider ?? 'ollama';
	if (isCloudBearerProvider(provider)) {
		return true;
	}
	if (provider === 'ollama' && isOllamaCloudServer(context?.server)) {
		return true;
	}
	return false;
}

/**
 * Fusionne auth HTTP pour les requêtes LLM.
 * - **Cloud** : Bearer selon doc prestataire (ou host ollama.com pour rétrocompat).
 * - **Self-hosted** : uniquement les headers du wizard — pas d’injection x-api-key globale.
 */
export function mergeLlmHttpHeaders(
	apiKey: string,
	custom: DroxLlmHeadersMap,
	context?: IDroxLlmAuthContext,
): Record<string, string> {
	const out: Record<string, string> = { ...custom };
	const key = apiKey.trim();
	if (!key || hasAuthorizationHeader(out)) {
		return out;
	}
	if (usesBearerApiKeyAuth(context)) {
		out.Authorization = `Bearer ${key}`;
	}
	return out;
}

export function llmHeadersForRpc(
	apiKey: string,
	custom: DroxLlmHeadersMap,
	context?: IDroxLlmAuthContext,
): Record<string, string> | undefined {
	const merged = mergeLlmHttpHeaders(apiKey, custom, context);
	return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Le moteur Rust mappe `apiKey` → x-api-key : on ne l’envoie plus par défaut.
 * Self-hosted : auth via `llmHeaders` (ex. x-api-key saisi manuellement dans le wizard).
 */
export function shouldSendApiKeyRpcParam(_apiKey: string, _mergedHeaders: DroxLlmHeadersMap): boolean {
	return false;
}

