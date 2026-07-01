/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import {
	DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
	DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,
	markDroxEngineSessionOpened,
	readDroxEngineSessionRecency,
	readLastDroxEngineSessionId,
	sortDroxSessionEntriesByRecency,
} from '../../common/droxSharedChatSessionHistory.js';

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

function droxSessionUri(sessionId: string): string {
	return DroxChatSessionUri.forSession(sessionId).toString();
}

suite('droxSharedChatSessionHistory', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const ws = 'C:/Projects/MyApp';

	test('mark + read profile-scoped last session', () => {
		const storage = mockStorage();
		markDroxEngineSessionOpened(storage, ws, 'ses_aaa');
		assert.strictEqual(readLastDroxEngineSessionId(storage, ws), 'ses_aaa');
	});

	test('read falls back to agentSessions.recencyHistory workspace entry', () => {
		const storage = mockStorage();
		storage.store(
			DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
			JSON.stringify([{ session: droxSessionUri('ses_from_agents') }]),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
		assert.strictEqual(readLastDroxEngineSessionId(storage, ws), 'ses_from_agents');
	});

	test('profile map wins over workspace recency', () => {
		const storage = mockStorage();
		markDroxEngineSessionOpened(storage, ws, 'ses_profile');
		storage.store(
			DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
			JSON.stringify([{ session: droxSessionUri('ses_workspace') }]),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
		assert.strictEqual(readLastDroxEngineSessionId(storage, ws), 'ses_profile');
	});

	test('mark writes workspace recency for Agents window', () => {
		const storage = mockStorage();
		markDroxEngineSessionOpened(storage, ws, 'ses_sync');
		const raw = storage.get(DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, StorageScope.WORKSPACE);
		assert.ok(raw?.includes('ses_sync'));
		const profile = storage.get(DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, StorageScope.PROFILE);
		assert.ok(profile?.includes('ses_sync'));
	});

	test('mark preserves MRU order across sessions', () => {
		const storage = mockStorage();
		markDroxEngineSessionOpened(storage, ws, 'ses_a');
		markDroxEngineSessionOpened(storage, ws, 'ses_b');
		markDroxEngineSessionOpened(storage, ws, 'ses_a');
		assert.deepStrictEqual(readDroxEngineSessionRecency(storage, ws), ['ses_a', 'ses_b']);
		assert.strictEqual(readLastDroxEngineSessionId(storage, ws), 'ses_a');
		const raw = storage.get(DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, StorageScope.WORKSPACE);
		assert.ok(raw);
		assert.ok(raw.indexOf('ses_a') < raw.indexOf('ses_b'));
	});

	test('sortDroxSessionEntriesByRecency prefers shared order', () => {
		const entries = [
			{ id: 'ses_old', modifiedSecs: 1, sizeBytes: 1 },
			{ id: 'ses_new', modifiedSecs: 99, sizeBytes: 1 },
			{ id: 'ses_mid', modifiedSecs: 50, sizeBytes: 1 },
		];
		const sorted = sortDroxSessionEntriesByRecency(entries, ['ses_mid', 'ses_old']);
		assert.deepStrictEqual(sorted.map(e => e.id), ['ses_mid', 'ses_old', 'ses_new']);
	});
});
