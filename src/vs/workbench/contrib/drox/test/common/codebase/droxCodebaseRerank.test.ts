/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { droxCodebaseRerankHits, pathRankMultiplier } from '../../../common/codebase/droxCodebaseRerank.js';
import { IDroxCodebaseHit } from '../../../common/codebase/droxCodebaseTypes.js';
import { parseCodebaseRetrievalFilter } from '../../../common/modelQuestions/droxModelQuestionParse.js';
import { resolveDroxModelQuestionVariant } from '../../../common/modelQuestions/droxModelQuestionResolve.js';
import { listDroxModelQuestionVariants } from '../../../common/modelQuestions/droxModelQuestionCatalog.js';

suite('Drox — model questions + rerank (no NL heuristics)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('catalog has versioned English comprehension variants', () => {
		const variants = listDroxModelQuestionVariants('codebase.retrieval.comprehension');
		assert.ok(variants.length >= 2);
		assert.ok(variants.every(v => v.language === 'en'));
		assert.ok(variants.some(v => v.variantId === 'v1'));
		assert.ok(variants.some(v => v.variantId === 'v1-compact'));
	});

	test('parseCodebaseRetrievalFilter accepts strict JSON', () => {
		const variant = resolveDroxModelQuestionVariant('codebase.retrieval.comprehension');
		const filter = parseCodebaseRetrievalFilter(JSON.stringify({
			searchQuery: 'GitHub API download metrics fetch',
			pathPrefixes: ['src/'],
			preferCodeFiles: true,
			skipRetrieval: false,
		}), variant);
		assert.ok(filter);
		assert.strictEqual(filter!.searchQuery, 'GitHub API download metrics fetch');
		assert.deepStrictEqual(filter!.pathPrefixes, ['src/']);
		assert.strictEqual(filter!.preferCodeFiles, true);
	});

	test('rerank path boost only when preferCodeFiles from filter', () => {
		const hits: IDroxCodebaseHit[] = [
			{ path: 'README_IDE_OR.md', startLine: 1, endLine: 10, score: 1.1, preview: 'github' },
			{ path: 'src/app/page.tsx', startLine: 1, endLine: 40, score: 0.46, preview: 'trackEvent' },
		];
		const plain = droxCodebaseRerankHits(hits, 2, { preferCodeFiles: false });
		assert.strictEqual(plain[0].path, 'README_IDE_OR.md');
		const boosted = droxCodebaseRerankHits(hits, 2, { preferCodeFiles: true });
		assert.strictEqual(boosted[0].path, 'src/app/page.tsx');
		assert.ok(pathRankMultiplier('src/app/page.tsx') > pathRankMultiplier('README_IDE_OR.md'));
	});
});
