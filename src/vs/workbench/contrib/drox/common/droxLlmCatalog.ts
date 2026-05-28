/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { asText, IRequestService } from '../../../../platform/request/common/request.js';
import { DroxSetting } from './droxConfiguration.js';
import { readWorkspaceDroxEnv } from './droxEnvFile.js';

export type DroxLlmProviderId = 'ollama' | 'vllm' | 'lmstudio';

export const DROX_LLM_PROVIDERS: readonly DroxLlmProviderId[] = ['ollama', 'vllm', 'lmstudio'];

export const DROX_DEFAULT_LLM_SERVER: Record<DroxLlmProviderId, string> = {
	ollama: 'http://127.0.0.1:11434',
	vllm: 'http://127.0.0.1:8000',
	lmstudio: 'http://127.0.0.1:1234',
};

/** @deprecated use DROX_DEFAULT_LLM_SERVER.ollama */
export const DROX_DEFAULT_OLLAMA_SERVER = DROX_DEFAULT_LLM_SERVER.ollama;

export interface IDroxLlmModelListResult {
	readonly models: readonly string[];
	readonly error?: string;
}

export interface IDroxLlmCatalogConnection {
	readonly provider: DroxLlmProviderId;
	readonly server: string;
	readonly apiKey: string;
}

export type DroxHttpGetFn = (url: string) => Promise<{ statusCode: number; body: string }>;

export function parseLlmProvider(value: unknown): DroxLlmProviderId {
	if (value === 'vllm' || value === 'lmstudio' || value === 'ollama') {
		return value;
	}
	return 'ollama';
}

export function readLlmProvider(configService: IConfigurationService, resource?: URI): DroxLlmProviderId {
	return parseLlmProvider(configService.getValue<string>(DroxSetting.LlmProvider, { resource }));
}

/** Normalise une URL de base (sans slash final). */
export function normalizeLlmServerBaseUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return '';
	}
	try {
		const u = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
		let path = u.pathname.replace(/\/+$/, '');
		if (path === '/') {
			path = '';
		}
		return `${u.origin}${path}`;
	} catch {
		return trimmed.replace(/\/+$/, '');
	}
}

export function resolveLlmServerUrl(provider: DroxLlmProviderId, configured: string): string {
	const normalized = normalizeLlmServerBaseUrl(configured);
	return normalized || DROX_DEFAULT_LLM_SERVER[provider];
}

/** URL exacte pour lister les modèles — pas de repli localhost si l'utilisateur n'a rien configuré. */
export function buildLlmModelListUrl(
	provider: DroxLlmProviderId,
	configured: string,
): { readonly url: string } | { readonly error: string } {
	const base = normalizeLlmServerBaseUrl(configured);
	if (!base) {
		return {
			error: 'URL serveur non configurée — renseignez drox.server (ou DROX_SERVER dans .drox/.env), puis Reload.',
		};
	}
	switch (provider) {
		case 'ollama':
			return { url: `${base}/api/tags` };
		case 'vllm':
		case 'lmstudio':
			return { url: base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models` };
	}
}

/** @deprecated use resolveLlmServerUrl('ollama', configured) */
export function resolveOllamaServerUrl(configured: string): string {
	return resolveLlmServerUrl('ollama', configured);
}

export async function resolveLlmCatalogConnection(
	configService: IConfigurationService,
	fileService: IFileService,
	workspaceUri: URI | undefined,
): Promise<IDroxLlmCatalogConnection> {
	const provider = readLlmProvider(configService, workspaceUri);
	const resourceOpts = workspaceUri ? { resource: workspaceUri } : {};
	const read = (key: string): string => {
		const v = configService.getValue<string>(key, resourceOpts);
		return typeof v === 'string' ? v.trim() : '';
	};
	let server = read(DroxSetting.Server);
	let apiKey = read(DroxSetting.ApiKey);
	const env = await readWorkspaceDroxEnv(fileService, workspaceUri);
	if (!server && env.DROX_SERVER) {
		server = env.DROX_SERVER.trim();
	}
	if (!apiKey && env.DROX_API_KEY) {
		apiKey = env.DROX_API_KEY.trim();
	}
	return { provider, server, apiKey };
}

function sortUniqueModelNames(names: string[]): string[] {
	return [...new Set(names.map(n => n.trim()).filter(n => n.length > 0))]
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function parseJsonBody<T>(body: string): T | null {
	if (!body.trim()) {
		return null;
	}
	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
}

async function httpGetText(httpGet: DroxHttpGetFn, url: string, callSite: string): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
	try {
		const res = await httpGet(url);
		if (!res.statusCode || res.statusCode >= 400) {
			return { ok: false, error: `HTTP ${res.statusCode || '?'} — ${url}` };
		}
		return { ok: true, body: res.body };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, error: msg };
	}
}

function localhostUrlVariants(url: string): string[] {
	try {
		const u = new URL(url);
		const variants: string[] = [url];
		if (u.hostname === '127.0.0.1') {
			u.hostname = 'localhost';
			variants.push(u.toString());
		} else if (u.hostname === 'localhost') {
			u.hostname = '127.0.0.1';
			variants.push(u.toString());
		}
		return [...new Set(variants)];
	} catch {
		return [url];
	}
}

interface IOllamaTagsResponse {
	readonly models?: ReadonlyArray<{ readonly name?: string; readonly model?: string }>;
}

interface IOpenAiModelsResponse {
	readonly data?: ReadonlyArray<{ readonly id?: string }>;
}

function extractOllamaModelNames(body: IOllamaTagsResponse | null): string[] {
	const names = (body?.models ?? []).map(m => {
		if (typeof m?.name === 'string' && m.name.trim()) {
			return m.name;
		}
		if (typeof m?.model === 'string' && m.model.trim()) {
			return m.model;
		}
		return '';
	});
	return sortUniqueModelNames(names);
}

async function fetchModelsFromListUrl(
	httpGet: DroxHttpGetFn,
	provider: DroxLlmProviderId,
	listUrl: string,
): Promise<IDroxLlmModelListResult> {
	const urls = localhostUrlVariants(listUrl);
	let lastError = '';
	for (const url of urls) {
		const res = await httpGetText(httpGet, url, 'droxLlmCatalog.fetchModelsFromListUrl');
		if (!res.ok) {
			lastError = res.error;
			continue;
		}
		if (provider === 'ollama') {
			const body = parseJsonBody<IOllamaTagsResponse>(res.body);
			const models = extractOllamaModelNames(body);
			if (models.length > 0) {
				return { models };
			}
			lastError = body ? 'Réponse Ollama sans modèle' : 'Réponse Ollama vide';
		} else {
			const body = parseJsonBody<IOpenAiModelsResponse>(res.body);
			const names = (body?.data ?? []).map(m => (typeof m?.id === 'string' ? m.id : ''));
			const models = sortUniqueModelNames(names);
			if (models.length > 0) {
				return { models };
			}
			lastError = body ? 'Réponse sans modèle' : 'Réponse vide';
		}
	}
	return { models: [], error: lastError || `Impossible de joindre ${listUrl}` };
}

export async function fetchLlmModelNames(
	httpGet: DroxHttpGetFn,
	provider: DroxLlmProviderId,
	configuredServer: string,
): Promise<IDroxLlmModelListResult & { listUrl?: string }> {
	const target = buildLlmModelListUrl(provider, configuredServer);
	if ('error' in target) {
		return { models: [], error: target.error };
	}
	const result = await fetchModelsFromListUrl(httpGet, provider, target.url);
	return { ...result, listUrl: target.url };
}

/** Fallback renderer (peut échouer sur localhost à cause du CORS). */
export function createRequestServiceHttpGet(requestService: IRequestService, headers?: Record<string, string>): DroxHttpGetFn {
	return async (url: string) => {
		const context = await requestService.request(
			{ type: 'GET', url, headers, callSite: 'droxLlmCatalog.createRequestServiceHttpGet' },
			CancellationToken.None,
		);
		const statusCode = context.res.statusCode ?? 0;
		if (statusCode >= 400) {
			return { statusCode, body: '' };
		}
		const body = (await asText(context)) ?? '';
		return { statusCode, body };
	};
}

export function createDroxLlmHttpGet(
	mainFetchHttp: (url: string, headers?: Record<string, string>) => Promise<{ statusCode: number; body: string }>,
	requestService: IRequestService,
	apiKey: string,
): DroxHttpGetFn {
	const authHeaders = apiKey.trim() ? { 'x-api-key': apiKey.trim() } : undefined;
	const fallback = createRequestServiceHttpGet(requestService, authHeaders);
	return async (url: string) => {
		try {
			return await mainFetchHttp(url, authHeaders);
		} catch {
			return fallback(url);
		}
	};
}
