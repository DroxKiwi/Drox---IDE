/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	isDroxLlmParamMuted,
	liveDroxLlmParamValue,
	normalizeDroxLlmParamsMuted,
} from '../../common/droxLlmParamMute.js';

suite('Drox — llm param mute', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalize keeps known unique keys only', () => {
		assert.deepStrictEqual(
			normalizeDroxLlmParamsMuted(['temperature', 'nope', 'temperature', 'topK']),
			['temperature', 'topK'],
		);
	});

	test('live value becomes undefined when muted', () => {
		const muted = normalizeDroxLlmParamsMuted(['seed']);
		assert.strictEqual(isDroxLlmParamMuted(muted, 'seed'), true);
		assert.strictEqual(liveDroxLlmParamValue(muted, 'seed', 42), undefined);
		assert.strictEqual(liveDroxLlmParamValue(muted, 'temperature', 0.7), 0.7);
	});
});
