/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isImageVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import {
	extractImageAttachmentPayloads,
	uiReplayImagesToVariableData,
} from '../../common/droxNativeChatRequestAttachments.js';

suite('droxNativeChatRequestAttachments', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extractImageAttachmentPayloads builds data URLs', () => {
		const payloads = extractImageAttachmentPayloads({
			variables: [{
				id: 'img-1',
				name: 'shot.png',
				fullName: 'shot.png',
				kind: 'image',
				value: new Uint8Array([1, 2, 3]),
				mimeType: 'image/png',
			}],
		});
		assert.strictEqual(payloads.length, 1);
		assert.strictEqual(payloads[0]!.name, 'shot.png');
		assert.ok(payloads[0]!.dataUrl?.startsWith('data:image/png;base64,'));
	});

	test('uiReplayImagesToVariableData round-trips image bytes', () => {
		const dataUrl = `data:image/png;base64,${encodeBase64(VSBuffer.fromString('abc'))}`;
		const variableData = uiReplayImagesToVariableData([{ relPath: '.drox/attachments/a.png', dataUrl }]);
		assert.ok(variableData);
		assert.strictEqual(variableData!.variables.length, 1);
		const entry = variableData!.variables[0]!;
		assert.ok(isImageVariableEntry(entry));
		assert.strictEqual(entry.name, '.drox/attachments/a.png');
	});
});
