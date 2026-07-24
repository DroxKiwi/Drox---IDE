/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	collectCommittedChangeEventKeys,
	mergeDroxSessionFileChanges,
} from '../../common/droxSessionGitChanges.js';
import { IDroxFileChangePayload } from '../../common/droxFileChange.js';
import { droxSessionChangePathKey } from '../../common/droxPathUtil.js';

suite('DroxSessionGitChanges', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('merge keeps session-only files (untracked / git lag)', () => {
		const fileA = URI.file('/repo/a.ts');
		const fileB = URI.file('/repo/b.ts');
		const sessionChanges = [
			{ uri: fileA, originalUri: URI.file('/snap/a.ts'), modifiedUri: fileA, insertions: 100, deletions: 50 },
			{ uri: fileB, originalUri: undefined, modifiedUri: fileB, insertions: 20, deletions: 10 },
		];
		const gitChanges = [
			{ uri: fileA, originalUri: fileA, modifiedUri: fileA, insertions: 3, deletions: 1 },
		];

		const merged = mergeDroxSessionFileChanges(sessionChanges, gitChanges);
		assert.strictEqual(merged.length, 2);
		const a = merged.find(c => c.uri.toString() === fileA.toString())!;
		const b = merged.find(c => c.uri.toString() === fileB.toString())!;
		assert.strictEqual(a.insertions, 3);
		assert.strictEqual(a.deletions, 1);
		assert.strictEqual(a.originalUri?.toString(), URI.file('/snap/a.ts').toString());
		assert.strictEqual(b.insertions, 20);
		assert.strictEqual(b.deletions, 10);
	});

	test('merge with empty git keeps session changes', () => {
		const fileA = URI.file('/repo/a.ts');
		const sessionChanges = [
			{ uri: fileA, originalUri: undefined, modifiedUri: fileA, insertions: 1023, deletions: 962 },
		];

		const merged = mergeDroxSessionFileChanges(sessionChanges, []);
		assert.strictEqual(merged.length, 1);
		assert.strictEqual(merged[0]!.insertions, 1023);
	});

	test('merge uses session stats when git entry has zero stats (untracked placeholder)', () => {
		const fileA = URI.file('/repo/a.ts');
		const sessionChanges = [
			{ uri: fileA, originalUri: undefined, modifiedUri: fileA, insertions: 12, deletions: 1 },
		];
		const gitChanges = [
			{ uri: fileA, originalUri: undefined, modifiedUri: fileA, insertions: 0, deletions: 0 },
		];

		const merged = mergeDroxSessionFileChanges(sessionChanges, gitChanges);
		assert.strictEqual(merged.length, 1);
		assert.strictEqual(merged[0]!.insertions, 12);
		assert.strictEqual(merged[0]!.deletions, 1);
	});

	test('collectCommittedChangeEventKeys only drops dirty→clean paths', () => {
		const events: IDroxFileChangePayload[] = [
			{ op: 'edit', path: '/repo/a.ts', relPath: 'a.ts', added: 1, removed: 0, diff: '', content: '', language: 'ts', applied: true, toolId: 't1' },
			{ op: 'edit', path: '/repo/b.ts', relPath: 'b.ts', added: 2, removed: 1, diff: '', content: '', language: 'ts', applied: true, toolId: 't2' },
		];
		const previouslyDirty = new Set([droxSessionChangePathKey('/repo/a.ts'), droxSessionChangePathKey('/repo/b.ts')]);
		const currentlyDirty = new Set([droxSessionChangePathKey('/repo/a.ts')]);
		const keys = collectCommittedChangeEventKeys(events, previouslyDirty, currentlyDirty);
		assert.deepStrictEqual(keys, ['t2']);
	});

	test('collectCommittedChangeEventKeys does not drop when never seen dirty', () => {
		const events: IDroxFileChangePayload[] = [
			{ op: 'edit', path: '/repo/a.ts', relPath: 'a.ts', added: 1, removed: 0, diff: '', content: '', language: 'ts', applied: true, toolId: 't1' },
		];
		const keys = collectCommittedChangeEventKeys(events, new Set(), new Set());
		assert.deepStrictEqual(keys, []);
	});
});
