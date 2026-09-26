/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import {
	createDroxIdeSessionHistoryGroup,
	pruneDroxIdeSessionHistoryGroups,
	readDroxIdeSessionHistoryGroups,
	removeSessionsFromDroxIdeHistoryGroups,
} from '../../common/droxIdeSessionHistoryGroups.js';

function mockStorage(): IStorageService {
	const data = new Map<string, string>();
	return {
		get(key: string, scope: StorageScope) {
			return data.get(`${scope}:${key}`);
		},
		store(key: string, value: string, scope: StorageScope, _target: StorageTarget) {
			data.set(`${scope}:${key}`, value);
		},
		remove(key: string, scope: StorageScope) {
			data.delete(`${scope}:${key}`);
		},
	} as unknown as IStorageService;
}

suite('DroxIdeSessionHistoryGroups', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('create / prune / remove membership', () => {
		const storage = mockStorage();
		createDroxIdeSessionHistoryGroup(storage, 'Work', ['ses_a', 'ses_b', 'ses_c']);
		assert.strictEqual(readDroxIdeSessionHistoryGroups(storage).length, 1);
		assert.deepStrictEqual(
			[...readDroxIdeSessionHistoryGroups(storage)[0]!.sessionIds].sort(),
			['ses_a', 'ses_b', 'ses_c'],
		);

		pruneDroxIdeSessionHistoryGroups(storage, new Set(['ses_a', 'ses_c']));
		assert.deepStrictEqual(
			[...readDroxIdeSessionHistoryGroups(storage)[0]!.sessionIds].sort(),
			['ses_a', 'ses_c'],
		);

		removeSessionsFromDroxIdeHistoryGroups(storage, ['ses_a']);
		assert.deepStrictEqual(
			[...readDroxIdeSessionHistoryGroups(storage)[0]!.sessionIds],
			['ses_c'],
		);

		removeSessionsFromDroxIdeHistoryGroups(storage, ['ses_c']);
		assert.strictEqual(readDroxIdeSessionHistoryGroups(storage).length, 0);
	});
});
