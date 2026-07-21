/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DroxLlmUrlResult, LLM_SERVER_NOT_CONFIGURED } from './openaiFamily.js';

export const PROVIDER_ID = 'ollama' as const;

export function modelListUrl(base: string): DroxLlmUrlResult {
	if (!base) {
		return { error: LLM_SERVER_NOT_CONFIGURED };
	}
	return { url: `${base}/api/tags` };
}

export function chatUrl(base: string): DroxLlmUrlResult {
	if (!base) {
		return { error: LLM_SERVER_NOT_CONFIGURED };
	}
	return { url: `${base}/api/chat` };
}

export function chatProbeBody(model: string): string {
	return JSON.stringify({
		model,
		stream: false,
		messages: [{ role: 'user', content: 'ping' }],
	});
}
