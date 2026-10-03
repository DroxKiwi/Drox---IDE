/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	buildTrafficMatchHaystack,
	destinationFromUrl,
	matchTrafficDestinationAlerts,
	matchTrafficDestinationTag,
	normalizeTrafficMatchNeedle,
} from '../../../common/traffic/droxTrafficTags.js';
import { IDroxTrafficDestinationTag } from '../../../common/traffic/droxTrafficTypes.js';

suite('Drox — Traffic destination tags', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const ollamaTag: IDroxTrafficDestinationTag = {
		id: 't1',
		label: 'Ollama',
		color: '#2E7D32',
		match: 'ollama.com',
	};

	test('normalizeTrafficMatchNeedle strips scheme and trailing slash', () => {
		assert.strictEqual(normalizeTrafficMatchNeedle('https://ollama.com/'), 'ollama.com');
		assert.strictEqual(normalizeTrafficMatchNeedle('api/tags'), 'api/tags');
	});

	test('destinationFromUrl keeps host + path for partial match', () => {
		assert.strictEqual(
			destinationFromUrl('https://www.ollama.com/api/tags?x=1'),
			'www.ollama.com/api/tags?x=1',
		);
	});

	test('matchTrafficDestinationTag matches ollama.com inside www.ollama.com/…', () => {
		const hit = matchTrafficDestinationTag(
			'www.ollama.com/api/tags',
			[ollamaTag],
		);
		assert.ok(hit);
		assert.strictEqual(hit?.label, 'Ollama');
	});

	test('matchTrafficDestinationTag matches via summary when destination is host-only', () => {
		const hit = matchTrafficDestinationTag(
			'www.ollama.com',
			[ollamaTag],
			'GET www.ollama.com/trucbidule ← 200',
		);
		assert.strictEqual(hit?.id, 't1');
	});

	test('matchTrafficDestinationTag prefers longer needle', () => {
		const tags: IDroxTrafficDestinationTag[] = [
			ollamaTag,
			{ id: 't2', label: 'API', color: '#1565C0', match: 'ollama.com/api' },
		];
		const hit = matchTrafficDestinationTag('https://www.ollama.com/api/tags', tags);
		assert.strictEqual(hit?.id, 't2');
	});

	test('matchTrafficDestinationAlerts returns all partial hits', () => {
		const hits = matchTrafficDestinationAlerts(
			'www.ollama.com/api/tags',
			[
				{ id: 'a1', match: 'ollama.com', label: 'Ollama' },
				{ id: 'a2', match: 'openai.com' },
			],
		);
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0]!.id, 'a1');
	});

	test('buildTrafficMatchHaystack includes host and summary', () => {
		const hay = buildTrafficMatchHaystack(
			'https://www.ollama.com/api/tags',
			'GET www.ollama.com/api/tags',
		);
		assert.ok(hay.includes('www.ollama.com'));
		assert.ok(hay.includes('www.ollama.com/api/tags'));
		assert.ok(hay.includes('get www.ollama.com/api/tags'));
	});
});
