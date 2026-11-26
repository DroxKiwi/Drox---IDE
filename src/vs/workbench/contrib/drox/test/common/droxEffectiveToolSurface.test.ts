/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeDroxEffectiveToolSurface } from '../../common/droxEffectiveToolSurface.js';

suite('Drox — droxEffectiveToolSurface', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('local-9b blocks web_search with profile reason', () => {
		const s = computeDroxEffectiveToolSurface({
			engineProfile: 'local-9b',
			l2Module: 'full',
			memoryEnabled: true,
		});
		assert.strictEqual(s.blocked.get('web_search'), 'profile');
		assert.ok(s.disabledTools.includes('web_search'));
	});

	test('custom L2 enables only selected tools under profile cap', () => {
		const s = computeDroxEffectiveToolSurface({
			engineProfile: 'local-9b',
			l2Module: 'custom',
			customEnabledTools: ['grep', 'file_read'],
			memoryEnabled: true,
		});
		assert.ok(!s.disabledTools.includes('grep'));
		assert.ok(!s.disabledTools.includes('file_read'));
		assert.ok(s.disabledTools.includes('bash'));
		assert.strictEqual(s.blocked.get('bash'), 'l2');
	});

	test('memory family disabled when memory off', () => {
		const s = computeDroxEffectiveToolSurface({
			engineProfile: 'cloud-full',
			l2Module: 'full',
			memoryEnabled: false,
		});
		assert.ok(s.disabledTools.includes('memory_read'));
		assert.strictEqual(s.blocked.get('memory_read'), 'family');
	});
});