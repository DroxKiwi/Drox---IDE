/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DroxLlmProviderId } from './types.js';
import * as huggingface from './huggingface.js';
import * as lmstudio from './lmstudio.js';
import * as mistral from './mistral.js';
import * as ollama from './ollama.js';
import * as openaiCompatible from './openaiCompatible.js';
import * as ovhcloud from './ovhcloud.js';
import * as scaleway from './scaleway.js';
import * as vllm from './vllm.js';
import type { DroxLlmUrlResult } from './openaiFamily.js';

export type { DroxLlmProviderId } from './types.js';
export type { DroxLlmUrlResult } from './openaiFamily.js';
export { DROX_DEFAULT_LLM_SERVER, DROX_LLM_PROVIDERS } from './types.js';

type ProviderEndpoints = {
	readonly modelListUrl: (base: string) => DroxLlmUrlResult;
	readonly chatUrl: (base: string) => DroxLlmUrlResult;
	readonly chatProbeBody: (model: string) => string;
};

const BY_ID: Record<DroxLlmProviderId, ProviderEndpoints> = {
	ollama,
	vllm,
	lmstudio,
	openai_compatible: openaiCompatible,
	huggingface,
	mistral,
	scaleway,
	ovhcloud,
};

export function providerModelListUrl(provider: DroxLlmProviderId, base: string): DroxLlmUrlResult {
	return BY_ID[provider].modelListUrl(base);
}

export function providerChatUrl(provider: DroxLlmProviderId, base: string): DroxLlmUrlResult {
	return BY_ID[provider].chatUrl(base);
}

export function providerChatProbeBody(provider: DroxLlmProviderId, model: string): string {
	return BY_ID[provider].chatProbeBody(model);
}
