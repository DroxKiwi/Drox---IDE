/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	applyDroxRegulationL3Directive,
	asDroxRegulationL3Module,
	droxRegulationL3DirectiveAnnex,
} from '../../../common/regulation/droxRegulationL3Directive.js';

suite('Drox regulation R8 L3 directive', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('laissez-faire omits annex', () => {
		assert.strictEqual(droxRegulationL3DirectiveAnnex('laissez-faire'), undefined);
		assert.strictEqual(applyDroxRegulationL3Directive('laissez-faire', 'notes'), 'notes');
	});

	test('guided prepends efficiency annex', () => {
		const out = applyDroxRegulationL3Directive('guided', 'session notes');
		assert.ok(out);
		assert.ok(/prefer tools/i.test(out!));
		assert.ok(out!.endsWith('session notes'));
	});

	test('assertive annex is stronger than guided', () => {
		const guided = droxRegulationL3DirectiveAnnex('guided')!;
		const assertive = droxRegulationL3DirectiveAnnex('assertive')!;
		assert.ok(/Anti-rumination/i.test(assertive));
		assert.ok(assertive.length > guided.length);
	});

	test('asDroxRegulationL3Module falls back for non-L3 modules', () => {
		assert.strictEqual(asDroxRegulationL3Module('core'), 'guided');
		assert.strictEqual(asDroxRegulationL3Module('assertive'), 'assertive');
	});
});
