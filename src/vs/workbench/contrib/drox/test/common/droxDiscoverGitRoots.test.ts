/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	isIgnoredGitScanDirectoryName,
	matchGitRootForPath,
} from '../../common/droxDiscoverGitRoots.js';

suite('DroxDiscoverGitRoots', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ignores common build/vendor directories', () => {
		assert.strictEqual(isIgnoredGitScanDirectoryName('node_modules'), true);
		assert.strictEqual(isIgnoredGitScanDirectoryName('.git'), true);
		assert.strictEqual(isIgnoredGitScanDirectoryName('src'), false);
	});

	test('matchGitRootForPath picks deepest matching root', () => {
		const parent = URI.file('/ws/parent');
		const childA = URI.file('/ws/parent/a');
		const childB = URI.file('/ws/parent/b');
		const roots = [parent, childA, childB];

		assert.strictEqual(
			matchGitRootForPath(roots, '/ws/parent/a/src/main.ts')?.toString(),
			childA.toString(),
		);
		assert.strictEqual(
			matchGitRootForPath(roots, '/ws/parent/b/readme.md')?.toString(),
			childB.toString(),
		);
		assert.strictEqual(
			matchGitRootForPath(roots, '/ws/parent/other/x.ts')?.toString(),
			parent.toString(),
		);
		assert.strictEqual(
			matchGitRootForPath([childA, childB], '/ws/parent/other/x.ts'),
			undefined,
		);
	});
});
