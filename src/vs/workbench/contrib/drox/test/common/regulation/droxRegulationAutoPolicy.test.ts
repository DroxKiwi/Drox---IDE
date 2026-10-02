/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	applyDroxRegulationAutoPolicy,
	recommendDroxRegulationModule,
} from '../../../common/regulation/droxRegulationAutoPolicy.js';
import { createDefaultRegulationSurfaceState } from '../../../common/regulation/droxRegulationTypes.js';

suite('Drox regulation R11 Auto policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recommend tightens when scores are low', () => {
		assert.strictEqual(recommendDroxRegulationModule('L1', 20), 'minimal');
		assert.strictEqual(recommendDroxRegulationModule('L2', 20), 'core');
		assert.strictEqual(recommendDroxRegulationModule('L3', 20), 'assertive');
		assert.strictEqual(recommendDroxRegulationModule('L4', 20), 'strict');
		assert.strictEqual(recommendDroxRegulationModule('L5', 20), 'aggressive');
	});

	test('recommend loosens when scores are high', () => {
		assert.strictEqual(recommendDroxRegulationModule('L1', 90), 'rich');
		assert.strictEqual(recommendDroxRegulationModule('L2', 90), 'full');
		assert.strictEqual(recommendDroxRegulationModule('L3', 90), 'laissez-faire');
		assert.strictEqual(recommendDroxRegulationModule('L4', 90), 'soft');
		assert.strictEqual(recommendDroxRegulationModule('L5', 90), 'passive');
	});

	test('apply only touches auto levers', () => {
		let surface = createDefaultRegulationSurfaceState();
		surface = {
			...surface,
			L1: { lever: 'L1', mode: 'auto', module: 'standard' },
			L2: { lever: 'L2', mode: 'manual', module: 'full' },
		};
		const next = applyDroxRegulationAutoPolicy(surface, {
			L1: 20,
			L2: 20,
			L3: 50,
			L4: 50,
			L5: 50,
		});
		assert.strictEqual(next.L1.module, 'minimal');
		assert.strictEqual(next.L1.mode, 'auto');
		assert.strictEqual(next.L2.module, 'full');
		assert.strictEqual(next.L2.mode, 'manual');
	});

	test('apply returns same reference when unchanged', () => {
		let surface = createDefaultRegulationSurfaceState();
		surface = {
			...surface,
			L1: { lever: 'L1', mode: 'auto', module: 'standard' },
		};
		const next = applyDroxRegulationAutoPolicy(surface, {
			L1: 60,
			L2: 50,
			L3: 50,
			L4: 50,
			L5: 50,
		});
		assert.strictEqual(next, surface);
	});
});
