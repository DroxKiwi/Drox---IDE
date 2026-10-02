/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	buildDroxCodebaseCatalog,
	droxCodebaseDeleteCatalogPaths,
	droxCodebasePruneOrphanVectors,
} from '../../../common/codebase/droxCodebaseCatalog.js';
import { IDroxCodebaseChunk } from '../../../common/codebase/droxCodebaseChunker.js';
import {
	droxCodebaseMergeExclusionGlobs,
	droxCodebasePathMatchesExclusion,
} from '../../../common/codebase/droxCodebaseExclusions.js';
import { IDroxCodebaseVectorRow } from '../../../common/codebase/droxCodebaseHybrid.js';

suite('Drox codebase CB3b catalogue', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const chunks: IDroxCodebaseChunk[] = [
		{ id: 'a.ts:1-10:1', path: 'src/a.ts', startLine: 1, endLine: 10, contentHash: '1', text: 'hello world' },
		{ id: 'a.ts:11-20:2', path: 'src/a.ts', startLine: 11, endLine: 20, contentHash: '2', text: 'more text' },
		{ id: 'b.ts:1-5:3', path: 'src/b.ts', startLine: 1, endLine: 5, contentHash: '3', text: 'other' },
	];

	const vectors: IDroxCodebaseVectorRow[] = [
		{ chunkId: 'a.ts:1-10:1', path: 'src/a.ts', startLine: 1, endLine: 10, preview: 'hello', values: [0.1, 0.2] },
		{ chunkId: 'orphan', path: 'src/a.ts', startLine: 99, endLine: 99, preview: 'gone', values: [0.3] },
	];

	test('buildCatalog groups files and marks vectors', () => {
		const cat = buildDroxCodebaseCatalog(chunks, vectors);
		assert.strictEqual(cat.totalFiles, 2);
		assert.strictEqual(cat.totalChunks, 3);
		assert.strictEqual(cat.files[0].path, 'src/a.ts');
		assert.strictEqual(cat.files[0].chunkCount, 2);
		assert.strictEqual(cat.files[0].vectorCount, 1);
		assert.strictEqual(cat.files[0].chunks[0].hasVector, true);
		assert.strictEqual(cat.files[0].chunks[1].hasVector, false);
	});

	test('deleteCatalogPaths removes chunks and vectors for path', () => {
		const next = droxCodebaseDeleteCatalogPaths(chunks, vectors, ['src/a.ts']);
		assert.strictEqual(next.removedChunks, 2);
		assert.strictEqual(next.chunks.length, 1);
		assert.strictEqual(next.chunks[0].path, 'src/b.ts');
		assert.strictEqual(next.vectors.length, 0);
	});

	test('pruneOrphanVectors drops missing chunkIds', () => {
		const pruned = droxCodebasePruneOrphanVectors(chunks, vectors);
		assert.strictEqual(pruned.removed, 1);
		assert.strictEqual(pruned.vectors.length, 1);
		assert.strictEqual(pruned.vectors[0].chunkId, 'a.ts:1-10:1');
	});

	test('exclusions match exact path, folder prefix and glob', () => {
		assert.strictEqual(droxCodebasePathMatchesExclusion('src/a.ts', ['src/a.ts']), true);
		assert.strictEqual(droxCodebasePathMatchesExclusion('docs/exports/x.json', ['docs/exports']), true);
		assert.strictEqual(droxCodebasePathMatchesExclusion('test/fixtures/a.ts', ['**/fixtures/**']), true);
		assert.strictEqual(droxCodebasePathMatchesExclusion('src/b.ts', ['src/a.ts']), false);
	});

	test('mergeExclusionGlobs dedupes and sorts', () => {
		const merged = droxCodebaseMergeExclusionGlobs(['src/a.ts', '**/tmp/**'], ['src/a.ts', 'docs/**']);
		assert.deepStrictEqual(merged, ['**/tmp/**', 'docs/**', 'src/a.ts']);
	});
});
