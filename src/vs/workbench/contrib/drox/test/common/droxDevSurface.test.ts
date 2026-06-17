/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getDroxSurface, isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';

suite('droxDevSurface', () => {
	test('getDroxSurface defaults to dev', () => {
		assert.strictEqual(getDroxSurface({}), 'dev');
		assert.strictEqual(getDroxSurface({ droxSurface: undefined }), 'dev');
		assert.strictEqual(getDroxSurface({ droxSurface: 'dev' }), 'dev');
	});

	test('getDroxSurface release', () => {
		assert.strictEqual(getDroxSurface({ droxSurface: 'release' }), 'release');
	});

	test('isDroxDevFeatureEnabled follows surface', () => {
		const dev = { droxSurface: 'dev' as const };
		const release = { droxSurface: 'release' as const };
		assert.strictEqual(isDroxDevFeatureEnabled('exportTranscript', dev), true);
		assert.strictEqual(isDroxDevFeatureEnabled('exportTranscript', release), false);
		assert.strictEqual(isDroxDevFeatureEnabled('chatVersionDevSuffix', release), false);
		assert.strictEqual(isDroxDevFeatureEnabled('executablePath', dev), true);
		assert.strictEqual(isDroxDevFeatureEnabled('executablePath', release), false);
		assert.strictEqual(isDroxDevFeatureEnabled('advancedLlmSettings', dev), true);
		assert.strictEqual(isDroxDevFeatureEnabled('advancedLlmSettings', release), false);
	});
});
