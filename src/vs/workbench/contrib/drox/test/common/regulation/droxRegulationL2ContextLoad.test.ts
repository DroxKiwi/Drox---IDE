/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	buildDroxAgentRunContextLoadParams,
	droxRegulationL2ContextLoad,
} from '../../../common/regulation/droxRegulationL2ContextLoad.js';

suite('Drox regulation L2 Context-load', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('core disables inject', () => {
		const p = droxRegulationL2ContextLoad('core');
		assert.strictEqual(p.inject, false);
		assert.strictEqual(p.maxRecommendedN, 0);
		assert.strictEqual(buildDroxAgentRunContextLoadParams('core', true), undefined);
	});

	test('standard injects with N≤3 when Explore on', () => {
		const p = droxRegulationL2ContextLoad('standard');
		assert.strictEqual(p.inject, true);
		assert.strictEqual(p.maxRecommendedN, 3);
		assert.strictEqual(p.kbDivisor, 40);
		const wire = buildDroxAgentRunContextLoadParams('standard', true);
		assert.deepStrictEqual(wire, {
			inject: true,
			maxRecommendedN: 3,
			kbDivisor: 40,
		});
	});

	test('full allows N≤4', () => {
		const p = droxRegulationL2ContextLoad('full');
		assert.strictEqual(p.maxRecommendedN, 4);
		assert.ok(buildDroxAgentRunContextLoadParams('full', true));
	});

	test('no wire when Explore disabled for run', () => {
		assert.strictEqual(buildDroxAgentRunContextLoadParams('full', false), undefined);
		assert.strictEqual(buildDroxAgentRunContextLoadParams('standard', false), undefined);
	});
});
