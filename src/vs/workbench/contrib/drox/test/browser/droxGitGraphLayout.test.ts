/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalGitCommit } from '../../../../../platform/git/common/localGitService.js';
import { computeDroxGitGraphLayout } from '../../browser/gitGraph/droxGitGraphLayout.js';

suite('computeDroxGitGraphLayout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function commit(hash: string, parents: string[]): ILocalGitCommit {
		return {
			hash,
			parents,
			authorName: 'Ada',
			authorEmail: 'ada@example.com',
			authorDateSeconds: 1,
			subject: hash,
		};
	}

	test('linear history stays on one lane with one color', () => {
		const rows = computeDroxGitGraphLayout([
			commit('c', ['b']),
			commit('b', ['a']),
			commit('a', []),
		]);
		assert.strictEqual(rows.length, 3);
		assert.deepStrictEqual(rows.map(r => r.lane), [0, 0, 0]);
		assert.deepStrictEqual(rows.map(r => r.colorIndex), [0, 0, 0]);
	});

	test('merge commit opens a second colored lane', () => {
		const rows = computeDroxGitGraphLayout([
			commit('m', ['a', 'b']),
			commit('a', ['root']),
			commit('b', ['root']),
			commit('root', []),
		]);
		assert.strictEqual(rows[0].lane, 0);
		assert.ok(rows[0].edges.some(e => e.fromLane !== e.toLane), 'merge should draw a cross-lane edge');
		assert.ok(rows.some(r => r.laneCount >= 2), 'merge history needs at least two lanes');
		assert.ok(rows[0].edges.some(e => e.colorIndex !== rows[0].colorIndex), 'merge parent stream uses a distinct color');
	});

	test('two diverging tips use different lanes and colors', () => {
		// Newest-first: tipA then tipB, then shared parent.
		const rows = computeDroxGitGraphLayout([
			commit('tipA', ['shared']),
			commit('tipB', ['shared']),
			commit('shared', []),
		]);
		assert.strictEqual(rows[0].lane, 0);
		assert.strictEqual(rows[1].lane, 1);
		assert.notStrictEqual(rows[0].colorIndex, rows[1].colorIndex);
		assert.ok(rows[2].laneCount >= 2 || rows[1].laneCount >= 2);
	});
});
