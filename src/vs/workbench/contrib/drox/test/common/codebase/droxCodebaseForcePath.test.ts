/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	droxForcePathPrefixesFromEditorFile,
	droxRelativePathUnderWorkspace,
} from '../../../common/codebase/droxCodebaseForcePath.js';

suite('droxCodebaseForcePath', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('relative path under workspace', () => {
		assert.strictEqual(
			droxRelativePathUnderWorkspace('C:\\repo', 'C:\\repo\\src\\app\\page.tsx'),
			'src/app/page.tsx',
		);
		assert.strictEqual(
			droxRelativePathUnderWorkspace('/home/u/repo', '/home/u/repo/a.ts'),
			'a.ts',
		);
		assert.strictEqual(
			droxRelativePathUnderWorkspace('C:\\repo', 'C:\\other\\x.ts'),
			undefined,
		);
	});

	test('force prefixes = file + parent dir', () => {
		assert.deepStrictEqual(
			droxForcePathPrefixesFromEditorFile('C:\\repo', 'C:\\repo\\src\\app\\page.tsx'),
			['src/app/page.tsx', 'src/app/'],
		);
		assert.deepStrictEqual(
			droxForcePathPrefixesFromEditorFile('/repo', '/repo/readme.md'),
			['readme.md'],
		);
	});
});
