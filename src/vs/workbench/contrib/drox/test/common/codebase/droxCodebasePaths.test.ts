/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { droxCodebaseChunkText } from '../../../common/codebase/droxCodebaseChunker.js';
import { DROX_EMBED_DEFAULT_MODEL_ID } from '../../../common/codebase/droxCodebaseEmbedPaths.js';
import { droxCodebaseHybridMerge } from '../../../common/codebase/droxCodebaseHybrid.js';
import { droxCodebaseShouldSkipDirName, droxCodebaseShouldSkipFileName } from '../../../common/codebase/droxCodebaseIgnore.js';
import { droxCodebaseLexicalSearch } from '../../../common/codebase/droxCodebaseLexicalSearch.js';
import { buildDroxCodebasePipelineView } from '../../../common/codebase/droxCodebaseTypes.js';
import { droxCodebaseChunksContentEqualForTest } from '../../../common/codebase/droxCodebaseIndexServiceImpl.js';
import { droxCodebaseChunksJsonPath, droxCodebaseIndexDir, droxCodebaseVectorsJsonPath } from '../../../common/codebase/droxCodebasePaths.js';

suite('Drox codebase CB1/CB2/CB2b', () => {
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

	test('default embed model id is MiniLM Q4', () => {
		assert.ok(DROX_EMBED_DEFAULT_MODEL_ID.includes('MiniLM'));
		assert.ok(DROX_EMBED_DEFAULT_MODEL_ID.endsWith('.gguf'));
	});

	test('CB2b chunk content equality uses hashes', () => {
		const a = droxCodebaseChunkText('x.ts', 'const a = 1;\n');
		const b = droxCodebaseChunkText('x.ts', 'const a = 1;\n');
		const c = droxCodebaseChunkText('x.ts', 'const a = 2;\n');
		assert.strictEqual(droxCodebaseChunksContentEqualForTest(a, b), true);
		assert.strictEqual(droxCodebaseChunksContentEqualForTest(a, c), false);
	});

	test('pipeline view derives stages from events', () => {
		const view = buildDroxCodebasePipelineView([
			{ id: '1', at: 1, runId: 'r1', kind: 'run_start', status: 'running', message: 'start', detail: { trigger: 'reindex' } },
			{ id: '2', at: 2, runId: 'r1', kind: 'scan', status: 'ok', message: 'scanned' },
			{ id: '3', at: 3, runId: 'r1', kind: 'chunk', status: 'running', message: 'chunking', detail: { progressPct: 40 } },
		]);
		assert.strictEqual(view.trigger, 'reindex');
		assert.strictEqual(view.stages.find(s => s.id === 'scan')?.state, 'done');
		assert.strictEqual(view.stages.find(s => s.id === 'chunk')?.state, 'active');
		assert.strictEqual(view.progressPct, 40);
	});

	test('pipeline stages all done after run_done', () => {
		const view = buildDroxCodebasePipelineView([
			{ id: '1', at: 1, runId: 'r1', kind: 'run_start', status: 'running', message: 'start', detail: { trigger: 'ensureIndexed' } },
			{ id: '2', at: 2, runId: 'r1', kind: 'scan', status: 'running', message: 'scanning' },
			{ id: '3', at: 3, runId: 'r1', kind: 'scan', status: 'ok', message: 'scanned' },
			{ id: '4', at: 4, runId: 'r1', kind: 'chunk', status: 'running', message: 'chunking' },
			{ id: '5', at: 5, runId: 'r1', kind: 'chunk', status: 'ok', message: 'chunked' },
			{ id: '6', at: 6, runId: 'r1', kind: 'embed_batch', status: 'ok', message: 'reused' },
			{ id: '7', at: 7, runId: 'r1', kind: 'upsert', status: 'running', message: 'writing' },
			{ id: '8', at: 8, runId: 'r1', kind: 'upsert', status: 'ok', message: 'written' },
			{ id: '9', at: 9, runId: 'r1', kind: 'run_done', status: 'ok', message: 'ready', detail: { progressPct: 100 } },
		]);
		assert.ok(view.stages.every(s => s.state === 'done'));
		assert.strictEqual(view.progressPct, 100);
	});
});
