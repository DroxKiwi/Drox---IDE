/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	applyDroxRegulationL4Protocol,
	asDroxRegulationL4Module,
	droxRegulationL4ProtocolAnnex,
} from '../../../common/regulation/droxRegulationL4Protocol.js';

suite('Drox regulation R9 L4 protocol', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('soft omits annex', () => {
		assert.strictEqual(droxRegulationL4ProtocolAnnex('soft'), undefined);
		assert.strictEqual(applyDroxRegulationL4Protocol('soft', 'notes'), 'notes');
	});

	test('normal prepends todo-before-mutation reminder', () => {
		const out = applyDroxRegulationL4Protocol('normal', 'session notes');
		assert.ok(out);
		assert.ok(/todo_write/i.test(out!));
		assert.ok(out!.endsWith('session notes'));
	});

	test('strict annex is stronger than normal', () => {
		const normal = droxRegulationL4ProtocolAnnex('normal')!;
		const strict = droxRegulationL4ProtocolAnnex('strict')!;
		assert.ok(/Strict protocol/i.test(strict));
		assert.ok(strict.length > normal.length);
	});

	test('asDroxRegulationL4Module falls back for non-L4 modules', () => {
		assert.strictEqual(asDroxRegulationL4Module('core'), 'normal');
		assert.strictEqual(asDroxRegulationL4Module('strict'), 'strict');
	});
});
