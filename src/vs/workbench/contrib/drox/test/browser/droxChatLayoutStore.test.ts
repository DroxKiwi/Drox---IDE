/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import {
	DroxChatLayoutStore,
	DROX_CHAT_LAYOUT_VERSION,
	DROX_CHAT_LAYOUT_LAST_MEMENTO_ID,
	droxChatLayoutMementoId,
} from '../../browser/droxChatLayoutStore.js';

suite('droxChatLayoutStore', () => {
	test('droxChatLayoutMementoId scopes layout per window', () => {
		assert.strictEqual(droxChatLayoutMementoId(1), 'drox.chat.layout.w1');
		assert.notStrictEqual(droxChatLayoutMementoId(1), droxChatLayoutMementoId(2));
		assert.strictEqual(DROX_CHAT_LAYOUT_LAST_MEMENTO_ID, 'drox.chat.layout.last');
	});

	test('windows do not share per-window tab layout on the same workspace', () => {
		const storage = new InMemoryStorageService();
		const snapshot = {
			version: DROX_CHAT_LAYOUT_VERSION,
			tabs: [{ sessionId: 'ses_window1', title: 'Tab A' }],
			activeTabId: 'ses_window1',
		};

		const window1 = new DroxChatLayoutStore(storage, 1);
		window1.save(snapshot);
		assert.deepStrictEqual(window1.load(), snapshot);

		// Window 2 has no w2 key, but falls back to `.last` written by window1.
		const window2 = new DroxChatLayoutStore(storage, 2);
		assert.deepStrictEqual(window2.load(), snapshot);
	});

	test('cold boot with new windowId restores via .last', () => {
		const storage = new InMemoryStorageService();
		const snapshot = {
			version: DROX_CHAT_LAYOUT_VERSION,
			tabs: [{ sessionId: 'ses_resume', title: 'Prior chat' }],
			activeTabId: 'ses_resume',
		};

		new DroxChatLayoutStore(storage, 42).save(snapshot);
		// Simulate Electron assigning a new window id on relaunch.
		const afterRelaunch = new DroxChatLayoutStore(storage, 99);
		assert.strictEqual(afterRelaunch.load()?.activeTabId, 'ses_resume');
	});

	test('clear removes window and last layout', () => {
		const storage = new InMemoryStorageService();
		const snapshot = {
			version: DROX_CHAT_LAYOUT_VERSION,
			tabs: [{ sessionId: 'ses_a' }],
			activeTabId: 'ses_a',
		};

		const window1 = new DroxChatLayoutStore(storage, 10);
		const window2 = new DroxChatLayoutStore(storage, 20);
		window1.save(snapshot);
		window2.save({
			...snapshot,
			tabs: [{ sessionId: 'ses_b' }],
			activeTabId: 'ses_b',
		});

		window1.clear();
		assert.strictEqual(window1.load(), undefined);
		// `.last` cleared too — window2 still has its own w20 key.
		assert.strictEqual(window2.load()?.activeTabId, 'ses_b');
	});
});
