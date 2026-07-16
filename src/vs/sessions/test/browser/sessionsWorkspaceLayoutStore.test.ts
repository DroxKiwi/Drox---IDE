/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope } from '../../../platform/storage/common/storage.js';
import {
	loadSessionsLayoutByWorkspaceMemento,
	resolveSessionsWorkspaceLayoutSnapshot,
	SESSIONS_LAYOUT_BY_WORKSPACE_KEY,
	SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY,
	sessionsWorkspaceLayoutKey,
} from '../../browser/sessionsWorkspaceLayoutStore.js';

suite('SessionsWorkspaceLayoutStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('migrates legacy flat keys into a global marker entry', () => {
		const storage = new InMemoryStorageService();
		storage.store('workbench.sessions.partVisibility', JSON.stringify({ sidebar: true, editor: false }), StorageScope.WORKSPACE, 0);
		storage.store('workbench.sessions.partSizes', JSON.stringify({ sessions: 640 }), StorageScope.WORKSPACE, 0);

		const memento = loadSessionsLayoutByWorkspaceMemento(storage);
		assert.strictEqual(memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY]?.partVisibility?.sidebar, true);
		assert.strictEqual(memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY]?.partSizes?.sessions, 640);
		assert.strictEqual(storage.get('workbench.sessions.partVisibility', StorageScope.WORKSPACE), undefined);
	});

	test('resolve moves legacy snapshot to the first real workspace key', () => {
		const memento: Record<string, { partSizes?: { editor?: number } }> = {
			[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY]: {
				partSizes: { editor: 500 },
			},
		};
		const key = sessionsWorkspaceLayoutKey('C:\\Projects\\Alpha');
		const snapshot = resolveSessionsWorkspaceLayoutSnapshot(memento, key);
		assert.strictEqual(snapshot?.partSizes?.editor, 500);
		assert.strictEqual(memento[key]?.partSizes?.editor, 500);
		assert.strictEqual(memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY], undefined);
	});

	test('stores independent snapshots per workspace path', () => {
		const storage = new InMemoryStorageService();
		const keyA = sessionsWorkspaceLayoutKey('C:\\Projects\\Alpha');
		const keyB = sessionsWorkspaceLayoutKey('C:\\Projects\\Beta');
		storage.store(
			SESSIONS_LAYOUT_BY_WORKSPACE_KEY,
			JSON.stringify({
				[keyA]: { partSizes: { sessions: 400 } },
				[keyB]: { partSizes: { sessions: 800 } },
			}),
			StorageScope.WORKSPACE,
			0,
		);

		const memento = loadSessionsLayoutByWorkspaceMemento(storage);
		assert.strictEqual(resolveSessionsWorkspaceLayoutSnapshot(memento, keyA)?.partSizes?.sessions, 400);
		assert.strictEqual(resolveSessionsWorkspaceLayoutSnapshot(memento, keyB)?.partSizes?.sessions, 800);
	});
});
