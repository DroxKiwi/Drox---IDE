/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	formatDroxCodebaseContextBlock,
	mergeDroxSystemSupplements,
} from '../../../common/codebase/droxCodebaseContextPack.js';
import { IDroxCodebaseHit } from '../../../common/codebase/droxCodebaseTypes.js';

suite('Drox — droxCodebaseContextPack', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formatDroxCodebaseContextBlock respects maxChars', () => {
		const hits: IDroxCodebaseHit[] = [
			{ path: 'a.ts', startLine: 1, endLine: 10, score: 0.9, preview: 'x'.repeat(200) },
			{ path: 'b.ts', startLine: 1, endLine: 5, score: 0.8, preview: 'y'.repeat(200) },
			{ path: 'c.ts', startLine: 1, endLine: 3, score: 0.7, preview: 'z'.repeat(200) },
		];
		const pack = formatDroxCodebaseContextBlock(hits, { maxChars: 400, query: 'find downloads' });
		assert.ok(pack);
		assert.ok(pack!.chars <= 450);
		assert.ok(pack!.hitCount >= 1);
		assert.ok(pack!.text.includes('[Codebase context — auto]'));
		assert.ok(pack!.text.includes('Query: find downloads'));
	});

	test('forced header and merge helpers', () => {
		const hits: IDroxCodebaseHit[] = [
			{ path: 'x.ts', startLine: 1, endLine: 2, score: 1, preview: 'hello' },
		];
		const pack = formatDroxCodebaseContextBlock(hits, { forced: true });
		assert.ok(pack!.text.includes('user forced'));
		assert.strictEqual(mergeDroxSystemSupplements(undefined, undefined), undefined);
		assert.ok(mergeDroxSystemSupplements('a', 'b')!.includes('a'));
	});
});
