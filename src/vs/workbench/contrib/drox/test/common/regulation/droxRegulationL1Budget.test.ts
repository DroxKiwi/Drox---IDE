/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	applyDroxRegulationL1InjectBudget,
	applyDroxRegulationL1SessionNotes,
	asDroxRegulationL1Module,
	droxRegulationL1Budget,
} from '../../../common/regulation/droxRegulationL1Budget.js';

suite('Drox regulation R6 L1 budget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('standard is identity on inject budget', () => {
		const out = applyDroxRegulationL1InjectBudget('standard', { maxChars: 5000, maxHits: 8 });
		assert.deepStrictEqual(out, { maxChars: 5000, maxHits: 8 });
		assert.strictEqual(droxRegulationL1Budget('standard').sessionNotesMaxChars, undefined);
	});

	test('minimal shrinks inject and omits session notes', () => {
		const out = applyDroxRegulationL1InjectBudget('minimal', { maxChars: 5000, maxHits: 8 });
		assert.strictEqual(out.maxChars, 1500);
		assert.strictEqual(out.maxHits, 3);
		assert.strictEqual(applyDroxRegulationL1SessionNotes('minimal', 'keep me'), undefined);
	});

	test('compact truncates long session notes', () => {
		const long = 'x'.repeat(900);
		const trimmed = applyDroxRegulationL1SessionNotes('compact', long);
		assert.ok(trimmed);
		assert.ok(trimmed!.length <= 800);
		assert.ok(trimmed!.endsWith('…'));
	});

	test('rich expands inject budget', () => {
		const out = applyDroxRegulationL1InjectBudget('rich', { maxChars: 5000, maxHits: 8 });
		assert.strictEqual(out.maxChars, 10000);
		assert.strictEqual(out.maxHits, 12);
	});

	test('asDroxRegulationL1Module falls back for non-L1 modules', () => {
		assert.strictEqual(asDroxRegulationL1Module('core'), 'standard');
		assert.strictEqual(asDroxRegulationL1Module('minimal'), 'minimal');
	});
});
