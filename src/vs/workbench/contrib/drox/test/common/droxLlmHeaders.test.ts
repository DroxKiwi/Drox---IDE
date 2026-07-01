/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	DROX_OLLAMA_CLOUD_SERVER,
	isOllamaCloudServer,
	llmHeadersForRpc,
	mergeLlmHttpHeaders,
	shouldSendApiKeyRpcParam,
	usesBearerApiKeyAuth,
} from '../../common/droxLlmHeaders.js';

suite('Drox — droxLlmHeaders', () => {

	test('local self-hosted never auto-injects x-api-key', () => {
		const merged = mergeLlmHttpHeaders('sk-local', {}, {
			provider: 'ollama',
			server: 'http://127.0.0.1:11434',
		});
		assert.strictEqual(merged['x-api-key'], undefined);
		assert.strictEqual(merged.Authorization, undefined);
	});

	test('local self-hosted uses only custom headers from wizard', () => {
		const merged = mergeLlmHttpHeaders('', {
			'x-api-key': 'my-gateway-key',
			Authorization: 'Bearer custom',
		}, { provider: 'ollama', server: 'https://gw.example.com' });
		assert.strictEqual(merged['x-api-key'], 'my-gateway-key');
		assert.strictEqual(merged.Authorization, 'Bearer custom');
	});

	test('Ollama Cloud uses Authorization Bearer only', () => {
		const merged = mergeLlmHttpHeaders('cloud-key', {}, {
			provider: 'ollama',
			server: DROX_OLLAMA_CLOUD_SERVER,
		});
		assert.strictEqual(merged.Authorization, 'Bearer cloud-key');
		assert.strictEqual(merged['x-api-key'], undefined);
	});

	test('legacy Ollama Cloud config (apiKey only) resolves via server host', () => {
		assert.ok(isOllamaCloudServer('https://ollama.com'));
		assert.ok(usesBearerApiKeyAuth({ provider: 'ollama', server: 'https://ollama.com' }));
		const merged = mergeLlmHttpHeaders('legacy', {}, { provider: 'ollama', server: 'https://ollama.com' });
		assert.strictEqual(merged.Authorization, 'Bearer legacy');
	});

	test('EU / open-weight cloud APIs use Bearer', () => {
		for (const provider of ['huggingface', 'mistral', 'scaleway', 'ovhcloud'] as const) {
			const merged = mergeLlmHttpHeaders('tok', {}, { provider, server: 'https://api.example.com' });
			assert.strictEqual(merged.Authorization, 'Bearer tok', provider);
		}
	});

	test('shouldSendApiKeyRpcParam never sends apiKey param (auth via headers)', () => {
		const cloud = llmHeadersForRpc('k', {}, { provider: 'ollama', server: 'https://ollama.com' });
		assert.ok(cloud);
		assert.strictEqual(shouldSendApiKeyRpcParam('k', cloud!), false);
		const local = llmHeadersForRpc('k', { 'x-api-key': 'k' }, { provider: 'ollama', server: 'http://localhost:11434' });
		assert.ok(local);
		assert.strictEqual(shouldSendApiKeyRpcParam('k', local!), false);
	});
});
