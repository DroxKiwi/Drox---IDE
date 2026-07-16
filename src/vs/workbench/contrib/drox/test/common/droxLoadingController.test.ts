/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DROX_LOADING_SHOW_DELAY_MS } from '../../browser/droxLoadingConstants.js';
import { DroxLoadingGate } from '../../browser/droxLoadingController.js';

suite('DroxLoadingGate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not show before delay elapses on fast loads', async () => {
		let showCount = 0;
		let hideCount = 0;
		const gate = new DroxLoadingGate({
			onShow: () => showCount++,
			onHide: () => hideCount++,
		}, 40);

		await gate.showWhile(Promise.resolve(1));

		assert.strictEqual(showCount, 0);
		assert.strictEqual(hideCount, 0);
	});

	test('shows after delay when load is slow', async () => {
		let showCount = 0;
		const gate = new DroxLoadingGate({
			onShow: () => { showCount++; },
			onHide: () => { },
		}, 20);

		await gate.showWhile(new Promise<number>(resolve => {
			setTimeout(() => resolve(42), 80);
		}));

		assert.strictEqual(showCount, 1);
	});

	test('joins concurrent loads until all settle', async () => {
		const events: string[] = [];
		const gate = new DroxLoadingGate({
			onShow: () => events.push('show'),
			onHide: () => events.push('hide'),
		}, 10);

		await Promise.all([
			gate.showWhile(new Promise<void>(resolve => setTimeout(resolve, 50))),
			gate.showWhile(new Promise<void>(resolve => setTimeout(resolve, 70))),
		]);

		assert.deepStrictEqual(events, ['show', 'hide']);
	});

	test('default delay matches shared constant', () => {
		assert.strictEqual(DROX_LOADING_SHOW_DELAY_MS, 450);
	});
});
