/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const PERSONAL_PROVIDERS = [
		{ id: 'ollama', label: 'Ollama', description: 'Local or remote Ollama server', defaultServer: 'http://127.0.0.1:11434' },
		{ id: 'vllm', label: 'vLLM', description: 'OpenAI-compatible API (vLLM)', defaultServer: 'http://127.0.0.1:8000' },
		{ id: 'lmstudio', label: 'LM Studio', description: 'Local LM Studio server', defaultServer: 'http://127.0.0.1:1234' },
		{ id: 'openai_compatible', label: 'OpenAI-compatible API', description: 'Any server exposing /v1/chat/completions', defaultServer: '' },
	];

	const CLOUD_PROVIDERS = [
		{
			id: 'huggingface',
			label: 'Hugging Face',
			description: 'Inference API (router OpenAI-compatible)',
			defaultServer: 'https://router.huggingface.co/v1',
			fields: [
				{ id: 'hfToken', label: 'Token Hugging Face', type: 'password', placeholder: 'hf_…', required: true, mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
			],
		},
		{
			id: 'mistral',
			label: 'Mistral AI',
			description: 'Mistral cloud API',
			defaultServer: 'https://api.mistral.ai/v1',
			fields: [
				{ id: 'mistralKey', label: 'Mistral API key', type: 'password', required: true, mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
			],
		},
		{
			id: 'ollama',
			label: 'Ollama (distant)',
			description: 'Hosted Ollama instance',
			defaultServer: '',
			fields: [
				{ id: 'remoteUrl', label: 'Server URL', type: 'url', placeholder: 'https://ollama.example.com', required: true, mapsToServer: true },
				{ id: 'remoteKey', label: 'API key (optional)', type: 'password', mapsToApiKey: true },
			],
		},
	];

	const PROVIDER_LABELS = {};
	for (const p of [...PERSONAL_PROVIDERS, ...CLOUD_PROVIDERS]) {
		PROVIDER_LABELS[p.id] = p.label;
	}

	fn.getConnectionProvidersForHosting = function(hosting) {
		return hosting === 'cloud' ? CLOUD_PROVIDERS : PERSONAL_PROVIDERS;
	};

	fn.getConnectionProviderLabel = function(providerId) {
		return PROVIDER_LABELS[providerId] || providerId || '—';
	};

	fn.findConnectionProviderDef = function(hosting, providerId) {
		const list = fn.getConnectionProvidersForHosting(hosting);
		return list.find(p => p.id === providerId) || null;
	};
})(globalThis.DroxChat);
