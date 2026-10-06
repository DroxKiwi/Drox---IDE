/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	eventTargetElement,
	resolveFileChangeOpenTarget,
} from '../../browser/agents/droxNativeFileChangeClick.js';

suite('Drox — native file-change click target', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('eventTargetElement climbs from Text node to parent', () => {
		const span = document.createElement('span');
		span.textContent = 'src/app/docs/page.tsx';
		const text = span.firstChild;
		assert.ok(text);
		assert.strictEqual(eventTargetElement(text), span);
		assert.strictEqual(eventTargetElement(span), span);
		assert.strictEqual(eventTargetElement(null), null);
	});

	test('resolveFileChangeOpenTarget works when click lands on path text node', () => {
		const card = document.createElement('div');
		card.className = 'drox-native-file-change msg-file-change';
		card.setAttribute('data-path', 'C:/repo/src/app/docs/page.tsx');
		card.setAttribute('data-tool-id', 'tu_1');

		const summary = document.createElement('div');
		summary.className = 'fc-summary';
		const path = document.createElement('a');
		path.className = 'fc-path';
		path.setAttribute('data-path', 'C:/repo/src/app/docs/page.tsx');
		path.setAttribute('data-tool-id', 'tu_1');
		path.textContent = 'src/app/docs/page.tsx';
		summary.appendChild(path);
		card.appendChild(summary);
		document.body.appendChild(card);

		try {
			const text = path.firstChild;
			assert.ok(text);
			const hit = resolveFileChangeOpenTarget(text);
			assert.ok(hit);
			assert.strictEqual(hit.path, 'C:/repo/src/app/docs/page.tsx');
			assert.strictEqual(hit.toolId, 'tu_1');
		} finally {
			card.remove();
		}
	});

	test('resolveFileChangeOpenTarget falls back to path text when data-path missing', () => {
		const card = document.createElement('div');
		card.className = 'drox-native-file-change';
		const summary = document.createElement('div');
		summary.className = 'fc-summary';
		const path = document.createElement('span');
		path.className = 'fc-path';
		path.textContent = 'src/app/docs/page.tsx';
		summary.appendChild(path);
		card.appendChild(summary);
		document.body.appendChild(card);

		try {
			const hit = resolveFileChangeOpenTarget(path.firstChild);
			assert.ok(hit);
			assert.strictEqual(hit.path, 'src/app/docs/page.tsx');
		} finally {
			card.remove();
		}
	});

	test('resolveFileChangeOpenTarget ignores diff body clicks', () => {
		const card = document.createElement('div');
		card.className = 'drox-native-file-change';
		card.setAttribute('data-path', 'C:/repo/a.ts');
		const body = document.createElement('div');
		body.className = 'fc-body';
		const line = document.createElement('div');
		line.className = 'diff-line';
		line.textContent = '+hello';
		body.appendChild(line);
		card.appendChild(body);
		document.body.appendChild(card);

		try {
			assert.strictEqual(resolveFileChangeOpenTarget(line), undefined);
		} finally {
			card.remove();
		}
	});
});
