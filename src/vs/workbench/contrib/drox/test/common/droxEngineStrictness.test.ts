/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Tests unitaires — `droxEngineStrictness.ts` (presets, normalisation, wire RPC).
 * Séparé de `droxCommon.test.ts` pour isoler la responsabilité strictness / PromptVars.
 */

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import {
	DROX_DEFAULT_ENGINE_STRICTNESS,
	DROX_ENGINE_STRICTNESS_PRESETS,
	normalizeDroxEngineStrictnessPreset,
	readDroxEngineStrictness,
	wireEngineStrictnessForRpc,
} from '../../common/droxEngineStrictness.js';
import { DroxSetting } from '../../common/droxConfiguration.js';

suite('Drox engine strictness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('default preset is normal', () => {
		assert.strictEqual(DROX_DEFAULT_ENGINE_STRICTNESS, 'normal');
		assert.deepStrictEqual([...DROX_ENGINE_STRICTNESS_PRESETS], ['relaxed', 'normal', 'strict', 'custom']);
	});

	test('normalizeDroxEngineStrictnessPreset maps legacy aliases', () => {
		assert.strictEqual(normalizeDroxEngineStrictnessPreset('hard'), 'strict');
		assert.strictEqual(normalizeDroxEngineStrictnessPreset('standard'), 'normal');
		assert.strictEqual(normalizeDroxEngineStrictnessPreset('light'), 'relaxed');
		assert.strictEqual(normalizeDroxEngineStrictnessPreset('bogus'), 'normal');
	});

	test('wireEngineStrictnessForRpc returns preset unchanged', () => {
		assert.strictEqual(wireEngineStrictnessForRpc('strict'), 'strict');
	});

	test('readDroxEngineStrictness uses configuration value', () => {
		const ws = URI.file('/tmp/ws');
		const config = new TestConfigurationService({
			[DroxSetting.EngineStrictness]: 'relaxed',
		});
		assert.strictEqual(readDroxEngineStrictness(config, ws), 'relaxed');
	});

	test('readDroxEngineStrictness falls back to normal when unset', () => {
		const config = new TestConfigurationService({});
		assert.strictEqual(readDroxEngineStrictness(config), 'normal');
	});
});
