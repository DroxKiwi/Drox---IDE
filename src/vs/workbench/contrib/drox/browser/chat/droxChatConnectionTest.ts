/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import {
	buildLlmModelListUrl,
	createDroxLlmHttp,
	fetchLlmModelNames,
	parseLlmProvider,
	probeLlmChat,
} from '../../common/droxLlmCatalog.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { mergeLlmHttpHeaders } from '../../common/droxLlmHeaders.js';
import { IDroxGeneralSettingsPatch } from './droxChatGeneralSettings.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';

export interface IDroxConnectionTestResult {
	readonly ok: boolean;
	readonly error?: string;
	readonly modelCount?: number;
	readonly listUrl?: string;
	readonly chatUrl?: string;
}

export interface IDroxConnectionTestDeps {
	readonly droxEngineService: IDroxEngineService;
	readonly requestService: IRequestService;
}

export async function testDroxLlmConnectionDraft(
	deps: IDroxConnectionTestDeps,
	draft: IDroxGeneralSettingsPatch,
): Promise<IDroxConnectionTestResult> {
	const provider = parseLlmProvider(draft.llmProvider);
	const server = String(draft.server ?? '').trim();
	if (!server) {
		return { ok: false, error: localize('drox.connection.test.noServer', 'Server URL is required.') };
	}
	const apiKey = String(draft.apiKey ?? '').trim();
	const customHeaders = draft.llmHeaders && typeof draft.llmHeaders === 'object' ? draft.llmHeaders : {};
	const authContext = { provider, server };
	const merged = mergeLlmHttpHeaders(apiKey, customHeaders, authContext);
	if (provider !== 'ollama' && !merged['Authorization'] && !merged['authorization'] && !merged['x-api-key'] && !apiKey) {
		// OpenAI-compatible cloud endpoints usually need auth — still try (local vLLM may not).
	}
	const listTarget = buildLlmModelListUrl(provider, server);
	if ('error' in listTarget) {
		return { ok: false, error: listTarget.error };
	}
	const http = createDroxLlmHttp(
		(url, headers, options) => deps.droxEngineService.fetchHttp(url, headers, options),
		deps.requestService,
		apiKey,
		customHeaders,
		authContext,
	);
	const httpGet = async (url: string) => http(url, { method: 'GET' });
	const result = await fetchLlmModelNames(httpGet, provider, server);
	if (result.error) {
		return { ok: false, error: result.error, listUrl: result.listUrl };
	}
	if (result.models.length === 0) {
		return {
			ok: false,
			error: localize('drox.connection.test.noModels', 'Server reachable but no models returned.'),
			listUrl: result.listUrl,
		};
	}
	const model = result.models[0]!;
	const chat = await probeLlmChat(http, provider, server, model);
	if (!chat.ok) {
		return {
			ok: false,
			error: localize(
				'drox.connection.test.chatFailed',
				'Models list OK, but chat endpoint failed ({0}). Runtime uses this URL — fix server/path or provider.',
				chat.error ?? 'unknown',
			),
			modelCount: result.models.length,
			listUrl: result.listUrl,
			chatUrl: chat.chatUrl,
		};
	}
	return {
		ok: true,
		modelCount: result.models.length,
		listUrl: result.listUrl,
		chatUrl: chat.chatUrl,
	};
}

export function postConnectionTestResult(
	host: { post(message: DroxHostToWebviewMessage): void },
	requestId: string,
	result: IDroxConnectionTestResult,
): void {
	host.post({
		kind: 'connectionTestResult',
		requestId,
		ok: result.ok,
		error: result.error,
		modelCount: result.modelCount,
		listUrl: result.listUrl,
	});
}
