/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { droxSubagentsEnabledForRun } from '../../common/droxSubagents.js';

suite('Drox — Explore sub-agents gate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('droxSubagentsEnabledForRun requires master ON and L2 standard/full', () => {
		assert.strictEqual(droxSubagentsEnabledForRun(true, 'standard'), true);
		assert.strictEqual(droxSubagentsEnabledForRun(true, 'full'), true);
		assert.strictEqual(droxSubagentsEnabledForRun(true, 'core'), false);
		assert.strictEqual(droxSubagentsEnabledForRun(false, 'standard'), false);
		assert.strictEqual(droxSubagentsEnabledForRun(false, 'full'), false);
		assert.strictEqual(droxSubagentsEnabledForRun(false, 'core'), false);
	});
});
