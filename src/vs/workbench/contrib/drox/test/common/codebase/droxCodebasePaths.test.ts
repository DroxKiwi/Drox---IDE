/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { droxCodebaseChunkText } from '../../../common/codebase/droxCodebaseChunker.js';
import { droxCodebaseHybridMerge } from '../../../common/codebase/droxCodebaseHybrid.js';
import { droxCodebaseShouldSkipDirName, droxCodebaseShouldSkipFileName } from '../../../common/codebase/droxCodebaseIgnore.js';
import { droxCodebaseLexicalSearch } from '../../../common/codebase/droxCodebaseLexicalSearch.js';
import { droxCodebaseChunksJsonPath, droxCodebaseIndexDir, droxCodebaseVectorsJsonPath } from '../../../common/codebase/droxCodebasePaths.js';

suite('Drox codebase CB1/CB2', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('paths use .drox/codebase-index', () => {
		const root = 'C:\\proj\\app';
		assert.strictEqual(droxCodebaseIndexDir(root).replace(/\\/g, '/'), 'C:/proj/app/.drox/codebase-index');
		assert.ok(droxCodebaseChunksJsonPath(root).endsWith('chunks.json'));
		assert.ok(droxCodebaseVectorsJsonPath(root).endsWith('vectors.json'));
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

	test('hybrid merge prefers strong cosine hits', () => {
		const lexical = [{
			path: 'a.ts',
			startLine: 1,
			endLine: 10,
			score: 0.2,
			preview: 'lexical only',
		}];
		const query = [1, 0, 0];
		const vectors = [
			{
				chunkId: 'b.ts:1-5:1',
				path: 'b.ts',
				startLine: 1,
				endLine: 5,
				preview: 'vector hit',
				values: [0.99, 0.01, 0],
			},
			{
				chunkId: 'a.ts:1-10:1',
				path: 'a.ts',
				startLine: 1,
				endLine: 10,
				preview: 'both',
				values: [0.5, 0.5, 0],
			},
		];
		const hits = droxCodebaseHybridMerge(lexical, query, vectors, 5);
		assert.ok(hits.length >= 2);
		assert.ok(hits.some(h => h.path === 'b.ts'));
		assert.ok(hits[0].score > 0);
	});
});
