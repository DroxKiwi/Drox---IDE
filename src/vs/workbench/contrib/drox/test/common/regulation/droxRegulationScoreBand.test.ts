/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { droxRegulationScoreBand } from '../../../common/regulation/droxRegulationScoreBand.js';

suite('Drox regulation R3 score band', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('bands map score ranges', () => {
		assert.strictEqual(droxRegulationScoreBand(100), 'good');
		assert.strictEqual(droxRegulationScoreBand(75), 'good');
		assert.strictEqual(droxRegulationScoreBand(74), 'warn');
		assert.strictEqual(droxRegulationScoreBand(50), 'warn');
		assert.strictEqual(droxRegulationScoreBand(49), 'bad');
		assert.strictEqual(droxRegulationScoreBand(0), 'bad');
	});
});
