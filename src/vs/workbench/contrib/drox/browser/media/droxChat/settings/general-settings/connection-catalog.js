/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file
// Miroir webview de droxCloudConnectionRegistry.ts — garder synchronisé.

(function (D) {
	const fn = D.fn;

	const CLOUD_GDPR_WARNING_EN = 'Outside the European framework, GDPR compliance cannot be guaranteed.';

	fn.cloudGdprWarningHtml = function(def) {
		if (!def || def.euHosted !== false) {
			return '';
		}
		return `<div class="drox-wizard-gdpr-warning" role="note">
			<span class="drox-wizard-gdpr-warning-icon" aria-hidden="true">&#9888;</span>
			<span>${fn.escapeHtmlAttr(CLOUD_GDPR_WARNING_EN)}</span>
		</div>`;
	};

	const PERSONAL_PROVIDERS = [
		{ id: 'ollama', label: 'Ollama', description: 'Serveur Ollama local ou distant', defaultServer: 'http://127.0.0.1:11434' },
		{ id: 'vllm', label: 'vLLM', description: 'API OpenAI-compatible (vLLM)', defaultServer: 'http://127.0.0.1:8000' },
		{ id: 'lmstudio', label: 'LM Studio', description: 'Serveur LM Studio local', defaultServer: 'http://127.0.0.1:1234' },
		{ id: 'openai_compatible', label: 'API OpenAI-compatible', description: 'Tout serveur exposant /v1/chat/completions', defaultServer: '' },
	];

	const CLOUD_PROVIDERS = [
		{
			id: 'ollama',
			label: 'Ollama Cloud',
			description: 'Modèles hébergés sur ollama.com',
			defaultServer: 'https://ollama.com',
			docUrl: 'https://docs.ollama.com/cloud',
			euHosted: false,
			setupHint: 'Créez une clé sur ollama.com/settings/keys — requise pour l’API cloud directe.',
			fields: [
				{ id: 'ollamaApiKey', label: 'OLLAMA_API_KEY', type: 'password', placeholder: 'Clé API ollama.com', required: true, help: 'Header : Authorization: Bearer <clé> (doc Authentication).', mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
			],
		},
		{
			id: 'huggingface',
			label: 'Hugging Face',
			description: 'Router open-weight (Inference Providers)',
			defaultServer: 'https://router.huggingface.co/v1',
			docUrl: 'https://huggingface.co/docs/inference-providers/index',
			euHosted: false,
			setupHint: 'Token fine-grained avec la permission « Make calls to Inference Providers ».',
			fields: [
				{ id: 'hfToken', label: 'HF_TOKEN', type: 'password', placeholder: 'hf_…', required: true, help: 'Authorization: Bearer hf_… — base URL router.huggingface.co/v1.', mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
			],
		},
		{
			id: 'mistral',
			label: 'Mistral AI',
			description: 'API cloud Mistral — EU (France)',
			defaultServer: 'https://api.mistral.ai/v1',
			docUrl: 'https://docs.mistral.ai/admin/security-access/api-keys',
			euHosted: true,
			setupHint: 'Clé API créée dans la console Mistral — header Authorization: Bearer.',
			fields: [
				{ id: 'mistralKey', label: 'MISTRAL_API_KEY', type: 'password', required: true, help: 'Authorization: Bearer $MISTRAL_API_KEY sur api.mistral.ai/v1.', mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
			],
		},
		{
			id: 'scaleway',
			label: 'Scaleway',
			description: 'Generative APIs (serverless ou dédié)',
			defaultServer: 'https://api.scaleway.ai/v1',
			docUrl: 'https://www.scaleway.com/en/docs/generative-apis/quickstart/',
			euHosted: true,
			setupHint: 'Clé secrète IAM Scaleway (SCW_SECRET_KEY) — compatible OpenAI SDK.',
			fields: [
				{ id: 'scwSecretKey', label: 'SCW_SECRET_KEY', type: 'password', required: true, help: 'Authorization: Bearer <secret key> — doc Using Generative APIs.', mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
				{ id: 'scwBaseUrl', label: 'URL de base (optionnel)', type: 'url', placeholder: 'https://api.scaleway.ai/v1', help: 'Par défaut : api.scaleway.ai/v1. Pour un déploiement dédié, URL …scaleway.com/v1 du déploiement.', mapsToServer: true },
			],
		},
		{
			id: 'ovhcloud',
			label: 'OVHcloud AI Endpoints',
			description: 'API serverless OVHcloud (OpenAI-compatible)',
			defaultServer: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
			docUrl: 'https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-getting-started/',
			euHosted: true,
			setupHint: 'Clé dans Public Cloud → AI & Machine Learning → AI Endpoints → API keys.',
			fields: [
				{ id: 'ovhToken', label: 'OVH_AI_ENDPOINTS_ACCESS_TOKEN', type: 'password', required: true, help: 'Bearer token — variable doc OVH_AI_ENDPOINTS_ACCESS_TOKEN.', mapsToHeader: 'Authorization', headerPrefix: 'Bearer ' },
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
