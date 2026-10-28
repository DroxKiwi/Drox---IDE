/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import {
	applyIdeNativeChatTabTitles,
	closeIdeNativeChatTab,
	DROX_IDE_NATIVE_CHAT_TAB_LIMIT,
	DroxIdeNativeChatTabsStore,
	ensureIdeNativeChatTab,
} from '../../browser/chat/droxIdeNativeChatTabs.js';

suite('droxIdeNativeChatTabs', () => {
	test('opens tabs until the limit and refuses one more', () => {
		let tabs: readonly { sessionId: string; title: string }[] = [];
		for (let i = 0; i < DROX_IDE_NATIVE_CHAT_TAB_LIMIT; i++) {
			const next = ensureIdeNativeChatTab(tabs, `ses_${i}`, `Chat ${i}`);
			assert.strictEqual(next.rejected, false);
			tabs = next.tabs;
		}
		const overflow = ensureIdeNativeChatTab(tabs, 'ses_overflow', 'Too many');
		assert.strictEqual(overflow.rejected, true);
		assert.strictEqual(overflow.tabs.length, DROX_IDE_NATIVE_CHAT_TAB_LIMIT);
	});

	test('close moves to the neighbor', () => {
		const tabs = [
			{ sessionId: 'ses_a', title: 'A' },
			{ sessionId: 'ses_b', title: 'B' },
			{ sessionId: 'ses_c', title: 'C' },
		];
		const closed = closeIdeNativeChatTab(tabs, 'ses_b');
		assert.deepStrictEqual(closed.tabs.map(tab => tab.sessionId), ['ses_a', 'ses_c']);
		assert.strictEqual(closed.nextSessionId, 'ses_c');
	});

	test('titles update from session names without dropping tabs', () => {
		const tabs = [{ sessionId: 'ses_a', title: 'New chat' }];
		const next = applyIdeNativeChatTabTitles(tabs, new Map([['ses_a', 'Analyser le projet']]));
		assert.strictEqual(next[0].title, 'Analyser le projet');
		assert.strictEqual(next[0].sessionId, 'ses_a');
	});

	test('store roundtrip stays on its own memento', () => {
		const storage = new InMemoryStorageService();
		const store = new DroxIdeNativeChatTabsStore(storage);
		store.save([{ sessionId: 'ses_saved', title: 'Saved' }], 'ses_saved');
		const loaded = store.load();
		assert.strictEqual(loaded.activeSessionId, 'ses_saved');
		assert.strictEqual(loaded.tabs[0].title, 'Saved');
	});
});
