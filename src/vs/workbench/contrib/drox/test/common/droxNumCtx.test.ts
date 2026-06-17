/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DROX_NUM_CTX_CHOICES, formatDroxNumCtxLabel, normalizeDroxNumCtx } from '../../common/droxNumCtx.js';

suite('droxNumCtx', () => {
	test('formatDroxNumCtxLabel', () => {
		assert.strictEqual(formatDroxNumCtxLabel(16_384), '16k');
		assert.strictEqual(formatDroxNumCtxLabel(32_768), '32k');
		assert.strictEqual(formatDroxNumCtxLabel(1_000_000), '1M');
	});

	test('normalizeDroxNumCtx keeps valid choices', () => {
		for (const choice of DROX_NUM_CTX_CHOICES) {
			assert.strictEqual(normalizeDroxNumCtx(choice), choice);
		}
	});

	test('normalizeDroxNumCtx snaps legacy values', () => {
		assert.strictEqual(normalizeDroxNumCtx(20_000), 16_384);
		assert.strictEqual(normalizeDroxNumCtx(200_000), 262_144);
		assert.strictEqual(normalizeDroxNumCtx(undefined), 32_768);
	});
});
