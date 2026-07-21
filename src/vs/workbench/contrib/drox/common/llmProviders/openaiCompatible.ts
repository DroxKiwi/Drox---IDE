/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	DroxLlmUrlResult,
	LLM_SERVER_NOT_CONFIGURED,
	openaiChatCompletionsUrl,
	openaiChatProbeBody,
	openaiModelsUrl,
} from './openaiFamily.js';

export const PROVIDER_ID = 'openai_compatible' as const;

export function modelListUrl(base: string): DroxLlmUrlResult {
	if (!base) {
		return { error: LLM_SERVER_NOT_CONFIGURED };
	}
	return { url: openaiModelsUrl(base) };
}

export function chatUrl(base: string): DroxLlmUrlResult {
	if (!base) {
		return { error: LLM_SERVER_NOT_CONFIGURED };
	}
	return { url: openaiChatCompletionsUrl(base) };
}

export function chatProbeBody(model: string): string {
	return openaiChatProbeBody(model);
}
