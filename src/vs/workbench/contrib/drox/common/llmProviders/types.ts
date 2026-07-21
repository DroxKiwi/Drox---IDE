/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DroxLlmProviderId =
	| 'ollama'
	| 'vllm'
	| 'lmstudio'
	| 'huggingface'
	| 'mistral'
	| 'scaleway'
	| 'ovhcloud'
	| 'openai_compatible';

export const DROX_LLM_PROVIDERS: readonly DroxLlmProviderId[] = [
	'ollama', 'vllm', 'lmstudio', 'huggingface', 'mistral', 'scaleway', 'ovhcloud', 'openai_compatible',
];

export const DROX_DEFAULT_LLM_SERVER: Record<DroxLlmProviderId, string> = {
	ollama: 'http://127.0.0.1:11434',
	vllm: 'http://127.0.0.1:8000',
	lmstudio: 'http://127.0.0.1:1234',
	huggingface: 'https://router.huggingface.co/v1',
	mistral: 'https://api.mistral.ai/v1',
	scaleway: 'https://api.scaleway.ai/v1',
	ovhcloud: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
	openai_compatible: '',
};
