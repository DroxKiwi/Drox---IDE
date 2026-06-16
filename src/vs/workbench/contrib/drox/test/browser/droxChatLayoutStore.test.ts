/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { DroxChatLayoutStore, DROX_CHAT_LAYOUT_VERSION, droxChatLayoutMementoId } from '../../browser/droxChatLayoutStore.js';

suite('droxChatLayoutStore', () => {
	test('droxChatLayoutMementoId scopes layout per window', () => {
		assert.strictEqual(droxChatLayoutMementoId(1), 'drox.chat.layout.w1');
		assert.notStrictEqual(droxChatLayoutMementoId(1), droxChatLayoutMementoId(2));
	});

	test('windows do not share persisted tab layout on the same workspace', () => {
		const storage = new InMemoryStorageService();
		const snapshot = {
			version: DROX_CHAT_LAYOUT_VERSION,
			tabs: [{ sessionId: 'ses_window1', title: 'Tab A' }],
			activeTabId: 'ses_window1',
		};

		const window1 = new DroxChatLayoutStore(storage, 1);
		window1.save(snapshot);
		assert.deepStrictEqual(window1.load(), snapshot);

		const window2 = new DroxChatLayoutStore(storage, 2);
		assert.strictEqual(window2.load(), undefined);
	});

	test('clear removes only the current window layout', () => {
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
		assert.strictEqual(window2.load()?.activeTabId, 'ses_b');
	});
});
