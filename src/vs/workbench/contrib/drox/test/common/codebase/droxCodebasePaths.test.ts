/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { droxCodebaseChunkText } from '../../../common/codebase/droxCodebaseChunker.js';
import { droxCodebaseShouldSkipDirName, droxCodebaseShouldSkipFileName } from '../../../common/codebase/droxCodebaseIgnore.js';
import { droxCodebaseLexicalSearch } from '../../../common/codebase/droxCodebaseLexicalSearch.js';
import { droxCodebaseChunksJsonPath, droxCodebaseIndexDir } from '../../../common/codebase/droxCodebasePaths.js';

suite('Drox codebase CB1', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('paths use .drox/codebase-index', () => {
		const root = 'C:\\proj\\app';
		assert.strictEqual(droxCodebaseIndexDir(root).replace(/\\/g, '/'), 'C:/proj/app/.drox/codebase-index');
		assert.ok(droxCodebaseChunksJsonPath(root).endsWith('chunks.json'));
	});

	test('ignore node_modules and secrets', () => {
		assert.strictEqual(droxCodebaseShouldSkipDirName('node_modules'), true);
		assert.strictEqual(droxCodebaseShouldSkipDirName('src'), false);
		assert.strictEqual(droxCodebaseShouldSkipFileName('.env'), true);
		assert.strictEqual(droxCodebaseShouldSkipFileName('main.ts'), false);
	});

	test('chunker produces overlapping windows', () => {
		const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join('\n');
		const chunks = droxCodebaseChunkText('a.ts', lines, 40, 10);
		assert.ok(chunks.length >= 3);
		assert.strictEqual(chunks[0].startLine, 1);
		assert.ok(chunks[0].text.includes('line1'));
	});

	test('lexical search ranks path and text hits', () => {
		const chunks = droxCodebaseChunkText('git/checkout.ts', 'function checkoutBranch() {\n  return true;\n}\n');
		const hits = droxCodebaseLexicalSearch(chunks, 'checkout branch', 5);
		assert.ok(hits.length >= 1);
		assert.ok(hits[0].path.includes('checkout'));
		assert.ok(hits[0].score > 0);
	});
});
