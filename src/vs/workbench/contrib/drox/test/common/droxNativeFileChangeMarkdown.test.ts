/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { buildDroxNativeFileChangeMarkdown } from '../../common/droxNativeFileChangeMarkdown.js';

suite('droxNativeFileChangeMarkdown', () => {
	test('buildDroxNativeFileChangeMarkdown includes path, stats and diff lines', () => {
		const md = buildDroxNativeFileChangeMarkdown({
			op: 'edit',
			path: 'C:/ws/test.md',
			relPath: 'test.md',
			added: 2,
			removed: 1,
			diff: '--- a\n+++ b\n@@ -1 +1,2 @@\n-old\n+new\n+more',
			content: '',
			language: 'markdown',
			applied: true,
			toolId: 'tool_1',
			canUndo: true,
		});
		const html = md.value;
		assert.ok(html.includes('drox-native-file-change'));
		assert.ok(html.includes('test.md'));
		assert.ok(html.includes('fc-add">+2'));
		assert.ok(html.includes('fc-rem">-1'));
		assert.ok(html.includes('diff-add'));
		assert.ok(html.includes('diff-rem'));
		assert.ok(html.includes('workbench.action.droxUndoFileChange'));
	});
});
