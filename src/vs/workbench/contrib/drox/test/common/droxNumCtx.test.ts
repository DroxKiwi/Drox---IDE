/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	clampDroxNumCtx,
	DROX_NUM_CTX_CHOICES,
	DROX_NUM_CTX_MAX,
	DROX_NUM_CTX_MIN,
	formatDroxNumCtxLabel,
	isDroxNumCtxPreset,
	normalizeDroxNumCtx,
} from '../../common/droxNumCtx.js';

suite('droxNumCtx', () => {
	test('formatDroxNumCtxLabel', () => {
		assert.strictEqual(formatDroxNumCtxLabel(16_384), '16k');
		assert.strictEqual(formatDroxNumCtxLabel(32_768), '32k');
		assert.strictEqual(formatDroxNumCtxLabel(1_000_000), '1M');
		assert.strictEqual(formatDroxNumCtxLabel(48_000), '47k');
	});

	test('isDroxNumCtxPreset', () => {
		assert.strictEqual(isDroxNumCtxPreset(32_768), true);
		assert.strictEqual(isDroxNumCtxPreset(48_000), false);
	});

	test('clampDroxNumCtx keeps custom values in range', () => {
		assert.strictEqual(clampDroxNumCtx(48_000), 48_000);
		assert.strictEqual(clampDroxNumCtx(100), DROX_NUM_CTX_MIN);
		assert.strictEqual(clampDroxNumCtx(9_000_000), DROX_NUM_CTX_MAX);
		assert.strictEqual(clampDroxNumCtx(undefined), 32_768);
	});

	test('normalizeDroxNumCtx snaps non-preset values', () => {
		for (const choice of DROX_NUM_CTX_CHOICES) {
			assert.strictEqual(normalizeDroxNumCtx(choice), choice);
		}
		assert.strictEqual(normalizeDroxNumCtx(20_000), 16_384);
		assert.strictEqual(normalizeDroxNumCtx(200_000), 262_144);
	});
});
