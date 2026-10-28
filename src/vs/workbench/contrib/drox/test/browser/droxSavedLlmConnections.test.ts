/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { parseDroxSavedLlmConnections, upsertDroxSavedLlmConnection } from '../../browser/chat/droxSavedLlmConnections.js';

suite('droxSavedLlmConnections', () => {
	test('parse keeps a connection and drops an empty server', () => {
		const list = parseDroxSavedLlmConnections([
			{ hosting: 'personal', provider: 'ollama', server: 'http://127.0.0.1:11434', apiKey: '', llmHeaders: {} },
			{ hosting: 'cloud', provider: 'mistral', server: '  ', apiKey: 'x' },
		]);
		assert.strictEqual(list.length, 1);
		assert.strictEqual(list[0].server, 'http://127.0.0.1:11434');
	});

	test('upsert replaces the same host, provider and server', () => {
		const first = parseDroxSavedLlmConnections([
			{ hosting: 'cloud', provider: 'ollama', server: 'https://ollama.com', apiKey: 'old', llmHeaders: {} },
		]);
		const next = upsertDroxSavedLlmConnection(first, {
			hosting: 'cloud',
			provider: 'ollama',
			server: 'https://ollama.com',
			apiKey: 'new',
			llmHeaders: {},
		});
		assert.strictEqual(next.length, 1);
		assert.strictEqual(next[0].apiKey, 'new');
	});
});
