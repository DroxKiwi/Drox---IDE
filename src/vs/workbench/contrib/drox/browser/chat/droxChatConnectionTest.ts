/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import {
	buildLlmModelListUrl,
	createDroxLlmHttpGet,
	fetchLlmModelNames,
	parseLlmProvider,
} from '../../common/droxLlmCatalog.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { mergeLlmHttpHeaders } from '../../common/droxLlmHeaders.js';
import { IDroxGeneralSettingsPatch, IDroxChatGeneralSettingsHost, pushGeneralSettingsToWebview, setDroxGeneralSettingsFromWebview } from './droxChatGeneralSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { refreshDroxChatLlmModels } from './droxChatLlmModels.js';
import { IDroxLlmModelsService } from '../../common/droxLlmModelsService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';

export interface IDroxConnectionTestResult {
	readonly ok: boolean;
	readonly error?: string;
	readonly modelCount?: number;
	readonly listUrl?: string;
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
	const merged = mergeLlmHttpHeaders(apiKey, customHeaders);
	if (provider !== 'ollama' && !merged['Authorization'] && !merged['authorization'] && !merged['x-api-key'] && !apiKey) {
		// OpenAI-compatible cloud endpoints usually need auth — still try (local vLLM may not).
	}
	const listTarget = buildLlmModelListUrl(provider, server);
	if ('error' in listTarget) {
		return { ok: false, error: listTarget.error };
	}
	const httpGet = createDroxLlmHttpGet(
		(url, headers) => deps.droxEngineService.fetchHttp(url, headers),
		deps.requestService,
		apiKey,
		customHeaders,
	);
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
	return { ok: true, modelCount: result.models.length, listUrl: result.listUrl };
}

export async function confirmAndResetLlmConnection(
	host: IDroxChatGeneralSettingsHost,
	deps: {
		readonly dialogService: IDialogService;
		readonly runSettingsService: IDroxRunSettingsService;
		readonly configurationService: IConfigurationService;
		readonly llmModelsService: IDroxLlmModelsService;
	},
): Promise<boolean> {
	const { confirmed } = await deps.dialogService.confirm({
		type: 'warning',
		message: localize('drox.connection.reset.title', 'Reset AI connection?'),
		detail: localize(
			'drox.connection.reset.detail',
			'Hosting, provider, server URL, API keys and custom headers will be cleared. You will need to run the connection wizard again.',
		),
		primaryButton: localize(
			{ key: 'drox.connection.reset.confirm', comment: ['&& denotes a mnemonic'] },
			'&&Reset',
		),
		cancelButton: localize('drox.connection.reset.cancel', 'Cancel'),
	});
	if (!confirmed) {
		return false;
	}
	await setDroxGeneralSettingsFromWebview(deps, {
		llmHosting: '',
		llmProvider: 'ollama',
		server: '',
		apiKey: '',
		llmHeaders: {},
	});
	pushGeneralSettingsToWebview(host, deps.runSettingsService, deps.configurationService);
	await refreshDroxChatLlmModels(host, deps.llmModelsService, deps.runSettingsService, deps.configurationService);
	return true;
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

export function postConnectionResetResult(
	host: { post(message: DroxHostToWebviewMessage): void },
	ok: boolean,
): void {
	host.post({ kind: 'connectionResetResult', ok });
}
