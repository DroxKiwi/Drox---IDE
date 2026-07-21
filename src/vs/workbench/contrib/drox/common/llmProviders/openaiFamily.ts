/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DroxLlmUrlResult = { readonly url: string } | { readonly error: string };

export const LLM_SERVER_NOT_CONFIGURED =
	'Server URL not configured — set drox.server (or DROX_SERVER in .drox/.env), then Reload.';

/** Join OpenAI `/v1/models` (base avec ou sans suffixe `/v1`). */
export function openaiModelsUrl(base: string): string {
	return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
}

/** Join OpenAI `/v1/chat/completions`. */
export function openaiChatCompletionsUrl(base: string): string {
	return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export function openaiChatProbeBody(model: string): string {
	return JSON.stringify({
		model,
		stream: false,
		max_tokens: 1,
		messages: [{ role: 'user', content: 'ping' }],
	});
}
