/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseDroxToolsSurfaceFile, serializeDroxToolsSurfaceFile } from '../../common/droxToolsSurfaceStore.js';

suite('Drox — droxToolsSurfaceStore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parse ignores unknown tool names', () => {
		const state = parseDroxToolsSurfaceFile(JSON.stringify({
			schema: 1,
			customActive: true,
			enabled: ['grep', 'not_a_tool', 'bash'],
		}));
		assert.strictEqual(state.customActive, true);
		assert.ok(state.enabled.includes('grep'));
		assert.ok(state.enabled.includes('bash'));
		assert.ok(!state.enabled.includes('not_a_tool'));
	});

	test('customActive false yields empty state', () => {
		const state = parseDroxToolsSurfaceFile(JSON.stringify({
			schema: 1,
			customActive: false,
			enabled: ['grep'],
		}));
		assert.strictEqual(state.customActive, false);
		assert.deepStrictEqual(state.enabled, []);
	});

	test('round-trip serialize', () => {
		const raw = serializeDroxToolsSurfaceFile({ customActive: true, enabled: ['file_read', 'grep'] });
		const state = parseDroxToolsSurfaceFile(raw);
		assert.deepStrictEqual([...state.enabled].sort(), ['file_read', 'grep']);
	});
});