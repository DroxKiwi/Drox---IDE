/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DROX_CODEBASE_RETRIEVAL_HINT } from '../../../common/codebase/droxCodebaseContextPack.js';
import {
	asDroxRegulationL5Module,
	droxRegulationL5RetrievalHint,
} from '../../../common/regulation/droxRegulationL5Retrieval.js';

suite('Drox regulation R10 L5 retrieval', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('passive omits hint', () => {
		assert.strictEqual(droxRegulationL5RetrievalHint('passive'), undefined);
	});

	test('nudge matches CB4 default hint', () => {
		assert.strictEqual(droxRegulationL5RetrievalHint('nudge'), DROX_CODEBASE_RETRIEVAL_HINT);
	});

	test('aggressive is stronger than nudge', () => {
		const aggressive = droxRegulationL5RetrievalHint('aggressive')!;
		assert.ok(/Retrieval required/i.test(aggressive));
		assert.ok(aggressive.length > DROX_CODEBASE_RETRIEVAL_HINT.length);
	});

	test('asDroxRegulationL5Module falls back for non-L5 modules', () => {
		assert.strictEqual(asDroxRegulationL5Module('core'), 'nudge');
		assert.strictEqual(asDroxRegulationL5Module('aggressive'), 'aggressive');
	});
});
