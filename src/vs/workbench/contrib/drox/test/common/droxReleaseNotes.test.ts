/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import {
	DROX_RELEASE_NOTES_SEEN_STORAGE_KEY,
	getDroxReleaseNotesItems,
	getDroxReleaseNotesProductVersion,
	hasSeenDroxReleaseNotes,
	markDroxReleaseNotesSeen,
} from '../../common/droxReleaseNotes.js';

function createMockStorage(): {
	get(key: string, scope: StorageScope, fallback?: string): string;
	store(key: string, value: string, scope: StorageScope, target: StorageTarget): void;
} {
	const app = new Map<string, string>();
	return {
		get(key, scope, fallback = '') {
			if (scope !== StorageScope.APPLICATION) {
				return fallback;
			}
			return app.get(key) ?? fallback;
		},
		store(key, value, scope) {
			if (scope === StorageScope.APPLICATION) {
				app.set(key, value);
			}
		},
	};
}

suite('Drox release notes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getDroxReleaseNotesProductVersion prefers droxVersion', () => {
		assert.strictEqual(
			getDroxReleaseNotesProductVersion({ droxVersion: '1.5.2', version: '1.99.0' }),
			'1.5.2',
		);
	});

	test('hasSeenDroxReleaseNotes and markDroxReleaseNotesSeen', () => {
		const storage = createMockStorage();
		assert.strictEqual(hasSeenDroxReleaseNotes(storage as never, '1.5.2'), false);
		markDroxReleaseNotesSeen(storage as never, '1.5.2');
		assert.strictEqual(
			storage.get(DROX_RELEASE_NOTES_SEEN_STORAGE_KEY, StorageScope.APPLICATION),
			'1.5.2',
		);
		assert.strictEqual(hasSeenDroxReleaseNotes(storage as never, '1.5.2'), true);
		assert.strictEqual(hasSeenDroxReleaseNotes(storage as never, '1.5.3'), false);
	});

	test('getDroxReleaseNotesItems includes 1.5.2 highlights', () => {
		const items = getDroxReleaseNotesItems('1.5.2');
		const joined = items.join('\n');
		assert.ok(joined.includes('agent.run'));
		assert.ok(joined.includes('max_iterations'));
		assert.ok(joined.includes('engine.tuning'));
	});

	test('getDroxReleaseNotesItems includes 1.5.3 highlights', () => {
		const items = getDroxReleaseNotesItems('1.5.3');
		const joined = items.join('\n');
		assert.ok(joined.includes('undo'));
		assert.ok(joined.includes('shell'));
		assert.ok(joined.includes('VT323'));
		assert.ok(joined.includes('replay'));
	});
});
