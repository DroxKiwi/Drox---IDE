/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { droxCodebaseChunksDbPath, droxCodebaseIndexDir, droxCodebaseManifestPath } from '../../../common/codebase/droxCodebasePaths.js';

suite('Drox codebase paths', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('index dir is under .drox/codebase-index', () => {
		const root = 'C:\\proj\\app';
		assert.strictEqual(droxCodebaseIndexDir(root).replace(/\\/g, '/'), 'C:/proj/app/.drox/codebase-index');
		assert.ok(droxCodebaseManifestPath(root).endsWith('manifest.json'));
		assert.ok(droxCodebaseChunksDbPath(root).endsWith('chunks.sqlite'));
	});
});
