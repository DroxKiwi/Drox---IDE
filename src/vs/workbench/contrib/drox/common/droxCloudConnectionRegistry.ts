/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DroxLlmProviderId } from './droxLlmCatalog.js';

/** URL officielle Ollama Cloud — doc : https://docs.ollama.com/cloud */
export const DROX_OLLAMA_CLOUD_SERVER = 'https://ollama.com';

/** Schéma d’auth HTTP documenté par le prestataire. */
export type DroxCloudAuthScheme = 'bearer' | 'x-api-key';

export interface IDroxCloudProviderFormField {
	readonly id: string;
	readonly label: string;
	readonly type: 'text' | 'password' | 'url';
	readonly placeholder?: string;
	readonly required?: boolean;
	/** Aide contextuelle sous le champ (doc officielle). */
	readonly help?: string;
	readonly mapsToApiKey?: boolean;
	readonly mapsToServer?: boolean;
	readonly mapsToHeader?: string;
	readonly headerPrefix?: string;
}

export interface IDroxCloudProviderSpec {
	readonly id: DroxLlmProviderId;
	readonly label: string;
	readonly description: string;
	readonly defaultServer: string;
	/** Lien doc officielle — affiché dans le wizard cloud. */
	readonly docUrl: string;
	readonly authScheme: DroxCloudAuthScheme;
	/** `true` = hébergement / cadre UE (pas d’avertissement RGPD). */
	readonly euHosted: boolean;
	readonly setupHint?: string;
	readonly fields: readonly IDroxCloudProviderFormField[];
}

/** Message wizard — prestataires open-weight hors UE. */
export const DROX_CLOUD_GDPR_WARNING_EN =
	'Outside the European framework, GDPR compliance cannot be guaranteed.';

export function cloudProviderRequiresGdprWarning(spec: IDroxCloudProviderSpec | undefined): boolean {
	return spec !== undefined && !spec.euHosted;
}

/**
 * Catalogue cloud Drox — critères d’admission :
 * - Soutien à la communauté **open-weight** (Ollama Cloud, Hugging Face Inference Providers)
 * - Prestataires **européens** sur modèles ouverts (Mistral, Scaleway, OVHcloud)
 * Exclus : agrégateurs US et APIs cloud fermées hors catalogue.
 */
export const DROX_CLOUD_PROVIDER_SPECS: readonly IDroxCloudProviderSpec[] = [
	{
		id: 'ollama',
		label: 'Ollama Cloud',
		description: 'Modèles hébergés sur ollama.com',
		defaultServer: DROX_OLLAMA_CLOUD_SERVER,
		docUrl: 'https://docs.ollama.com/cloud',
		authScheme: 'bearer',
		euHosted: false,
		setupHint: 'Créez une clé sur ollama.com/settings/keys — requise pour l’API cloud directe.',
		fields: [
			{
				id: 'ollamaApiKey',
				label: 'OLLAMA_API_KEY',
				type: 'password',
				placeholder: 'Clé API ollama.com',
				required: true,
				help: 'Header : Authorization: Bearer <clé> (doc Authentication).',
				mapsToHeader: 'Authorization',
				headerPrefix: 'Bearer ',
			},
		],
	},
	{
		id: 'huggingface',
		label: 'Hugging Face',
		description: 'Router open-weight (Inference Providers)',
		defaultServer: 'https://router.huggingface.co/v1',
		docUrl: 'https://huggingface.co/docs/inference-providers/index',
		authScheme: 'bearer',
		euHosted: false,
		setupHint: 'Token fine-grained avec la permission « Make calls to Inference Providers ».',
		fields: [
			{
				id: 'hfToken',
				label: 'HF_TOKEN',
				type: 'password',
				placeholder: 'hf_…',
				required: true,
				help: 'Authorization: Bearer hf_… — base URL router.huggingface.co/v1.',
				mapsToHeader: 'Authorization',
				headerPrefix: 'Bearer ',
			},
		],
	},
	{
		id: 'mistral',
		label: 'Mistral AI',
		description: 'API cloud Mistral — EU (France)',
		defaultServer: 'https://api.mistral.ai/v1',
		docUrl: 'https://docs.mistral.ai/admin/security-access/api-keys',
		authScheme: 'bearer',
		euHosted: true,
		setupHint: 'Clé API créée dans la console Mistral — header Authorization: Bearer.',
		fields: [
			{
				id: 'mistralKey',
				label: 'MISTRAL_API_KEY',
				type: 'password',
				required: true,
				help: 'Authorization: Bearer $MISTRAL_API_KEY sur api.mistral.ai/v1.',
				mapsToHeader: 'Authorization',
				headerPrefix: 'Bearer ',
			},
		],
	},
	{
		id: 'scaleway',
		label: 'Scaleway',
		description: 'Generative APIs (serverless ou dédié)',
		defaultServer: 'https://api.scaleway.ai/v1',
		docUrl: 'https://www.scaleway.com/en/docs/generative-apis/quickstart/',
		authScheme: 'bearer',
		euHosted: true,
		setupHint: 'Clé secrète IAM Scaleway (SCW_SECRET_KEY) — compatible OpenAI SDK.',
		fields: [
			{
				id: 'scwSecretKey',
				label: 'SCW_SECRET_KEY',
				type: 'password',
				required: true,
				help: 'Authorization: Bearer <secret key> — doc Using Generative APIs.',
				mapsToHeader: 'Authorization',
				headerPrefix: 'Bearer ',
			},
			{
				id: 'scwBaseUrl',
				label: 'URL de base (optionnel)',
				type: 'url',
				placeholder: 'https://api.scaleway.ai/v1',
				help: 'Par défaut : api.scaleway.ai/v1. Pour un déploiement dédié, URL …scaleway.com/v1 du déploiement.',
				mapsToServer: true,
			},
		],
	},
	{
		id: 'ovhcloud',
		label: 'OVHcloud AI Endpoints',
		description: 'API serverless OVHcloud (OpenAI-compatible)',
		defaultServer: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
		docUrl: 'https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-getting-started/',
		authScheme: 'bearer',
		euHosted: true,
		setupHint: 'Clé dans Public Cloud → AI & Machine Learning → AI Endpoints → API keys.',
		fields: [
			{
				id: 'ovhToken',
				label: 'OVH_AI_ENDPOINTS_ACCESS_TOKEN',
				type: 'password',
				required: true,
				help: 'Bearer token — variable doc OVH_AI_ENDPOINTS_ACCESS_TOKEN.',
				mapsToHeader: 'Authorization',
				headerPrefix: 'Bearer ',
			},
		],
	},
];

export const DROX_CLOUD_PROVIDER_IDS: readonly DroxLlmProviderId[] = DROX_CLOUD_PROVIDER_SPECS.map(s => s.id);

const _bearerCloud = new Set<DroxLlmProviderId>(
	DROX_CLOUD_PROVIDER_SPECS
		.filter(s => s.authScheme === 'bearer' && s.id !== 'ollama')
		.map(s => s.id),
);

/** Prestataires cloud dont la doc impose Authorization: Bearer. */
export function isCloudBearerProvider(provider: DroxLlmProviderId | undefined): boolean {
	return provider !== undefined && _bearerCloud.has(provider);
}

export function findCloudProviderSpec(providerId: string): IDroxCloudProviderSpec | undefined {
	return DROX_CLOUD_PROVIDER_SPECS.find(s => s.id === providerId);
}
