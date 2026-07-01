/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	DROX_CLOUD_PROVIDER_SPECS,
	DROX_CLOUD_GDPR_WARNING_EN,
	cloudProviderRequiresGdprWarning,
	findCloudProviderSpec,
	isCloudBearerProvider,
} from '../../common/droxCloudConnectionRegistry.js';
import { mergeLlmHttpHeaders } from '../../common/droxLlmHeaders.js';

suite('Drox — droxCloudConnectionRegistry', () => {

	test('catalog is limited to open-weight and EU providers', () => {
		const ids = DROX_CLOUD_PROVIDER_SPECS.map(s => s.id);
		assert.deepStrictEqual(ids.sort(), ['huggingface', 'mistral', 'ollama', 'ovhcloud', 'scaleway'].sort());
		assert.ok(!ids.includes('openrouter' as never));
		assert.ok(!ids.includes('deepseek' as never));
	});

	test('Mistral AI is in catalog as EU-hosted provider', () => {
		const mistral = findCloudProviderSpec('mistral');
		assert.ok(mistral);
		assert.strictEqual(mistral!.euHosted, true);
		assert.strictEqual(cloudProviderRequiresGdprWarning(mistral), false);
	});

	test('non-EU open-weight providers show GDPR warning', () => {
		for (const id of ['ollama', 'huggingface'] as const) {
			const spec = findCloudProviderSpec(id);
			assert.ok(spec);
			assert.strictEqual(spec!.euHosted, false);
			assert.strictEqual(cloudProviderRequiresGdprWarning(spec), true);
		}
		assert.ok(DROX_CLOUD_GDPR_WARNING_EN.includes('GDPR'));
	});

	test('EU providers do not require GDPR warning', () => {
		for (const id of ['mistral', 'scaleway', 'ovhcloud'] as const) {
			const spec = findCloudProviderSpec(id);
			assert.ok(spec);
			assert.strictEqual(spec!.euHosted, true);
			assert.strictEqual(cloudProviderRequiresGdprWarning(spec), false);
		}
	});

	test('every cloud provider has doc URL and at least one field', () => {
		for (const spec of DROX_CLOUD_PROVIDER_SPECS) {
			assert.ok(spec.docUrl.startsWith('https://'), spec.id);
			assert.ok(spec.defaultServer.startsWith('https://'), spec.id);
			assert.ok(spec.fields.length >= 1, spec.id);
		}
	});

	test('Scaleway optional dedicated base URL field', () => {
		const spec = findCloudProviderSpec('scaleway');
		assert.ok(spec?.fields.some(f => f.mapsToServer));
	});

	test('local Ollama is not a blanket bearer cloud provider', () => {
		assert.strictEqual(isCloudBearerProvider('ollama'), false);
		const merged = mergeLlmHttpHeaders('k', {}, { provider: 'ollama', server: 'http://127.0.0.1:11434' });
		assert.strictEqual(merged['x-api-key'], undefined);
		assert.strictEqual(merged.Authorization, undefined);
	});

	test('OVHcloud and Mistral use bearer auth scheme', () => {
		assert.strictEqual(isCloudBearerProvider('ovhcloud'), true);
		assert.strictEqual(isCloudBearerProvider('mistral'), true);
	});
});
