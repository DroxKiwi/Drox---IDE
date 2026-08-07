/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import {
	consumeDroxIdeSessionHandoff,
	DROX_IDE_SESSION_HANDOFF_MAX_AGE_MS,
	DROX_PENDING_IDE_SESSION_HANDOFF_KEY,
	peekDroxIdeSessionHandoff,
	writeDroxIdeSessionHandoff,
} from '../../common/droxIdeSessionHandoff.js';

function mockStorage(): IStorageService & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		get(key: string, scope: StorageScope) {
			return data.get(`${scope}:${key}`);
		},
		store(key: string, value: string, scope: StorageScope, _target: StorageTarget) {
			data.set(`${scope}:${key}`, value);
		},
		remove(key: string, scope: StorageScope) {
			data.delete(`${scope}:${key}`);
		},
	} as unknown as IStorageService & { data: Map<string, string> };
}

suite('droxIdeSessionHandoff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const ws = 'C:/Projects/MyApp';

	test('write then consume is one-shot', () => {
		const storage = mockStorage();
		assert.strictEqual(writeDroxIdeSessionHandoff(storage, ws, 'ses_abc'), true);
		assert.ok(peekDroxIdeSessionHandoff(storage));
		assert.strictEqual(consumeDroxIdeSessionHandoff(storage, ws), 'ses_abc');
		assert.strictEqual(consumeDroxIdeSessionHandoff(storage, ws), undefined);
		assert.strictEqual(peekDroxIdeSessionHandoff(storage), undefined);
	});

	test('wrong workspace does not consume', () => {
		const storage = mockStorage();
		writeDroxIdeSessionHandoff(storage, ws, 'ses_abc');
		assert.strictEqual(consumeDroxIdeSessionHandoff(storage, 'D:/Other'), undefined);
		assert.strictEqual(peekDroxIdeSessionHandoff(storage)?.sessionId, 'ses_abc');
		assert.strictEqual(consumeDroxIdeSessionHandoff(storage, 'C:\\Projects\\MyApp'), 'ses_abc');
	});

	test('rejects invalid session ids', () => {
		const storage = mockStorage();
		assert.strictEqual(writeDroxIdeSessionHandoff(storage, ws, 'not_a_session'), false);
		assert.strictEqual(peekDroxIdeSessionHandoff(storage), undefined);
	});

	test('stale handoff is cleared but not returned', () => {
		const storage = mockStorage();
		const now = 1_000_000;
		writeDroxIdeSessionHandoff(storage, ws, 'ses_old', now - DROX_IDE_SESSION_HANDOFF_MAX_AGE_MS - 1);
		assert.strictEqual(consumeDroxIdeSessionHandoff(storage, ws, now), undefined);
		assert.strictEqual(
			storage.get(DROX_PENDING_IDE_SESSION_HANDOFF_KEY, StorageScope.APPLICATION_SHARED),
			undefined,
		);
	});

	test('handoff beats empty storage for matching workspace', () => {
		const storage = mockStorage();
		writeDroxIdeSessionHandoff(storage, ws, 'ses_handoff');
		// Simulate IDE startup: consume before any local resolver fallback.
		const preferred = consumeDroxIdeSessionHandoff(storage, ws) ?? 'ses_local_persist';
		assert.strictEqual(preferred, 'ses_handoff');
	});
});
