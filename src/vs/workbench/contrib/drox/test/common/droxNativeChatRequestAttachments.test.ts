/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isImageVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import {
	extractAllDroxPastePayloads,
	extractFileReferencePayloads,
	extractImageAttachmentPayloads,
	extractStandardPastePayloads,
	prepareDroxNativeChatRunPrompt,
	toDroxSmartPasteVariableEntry,
	uiReplayImagesToVariableData,
} from '../../common/droxNativeChatRequestAttachments.js';
import { IDroxAttachmentsService } from '../../common/droxAttachmentsService.js';

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

	test('extractFileReferencePayloads collects file and directory URIs', () => {
		const fileUri = URI.file('/ws/README.md');
		const dirUri = URI.file('/ws/src');
		const payloads = extractFileReferencePayloads({
			variables: [
				{ id: 'f1', name: 'README.md', kind: 'file', value: fileUri },
				{ id: 'd1', name: 'src', kind: 'directory', value: dirUri },
			],
		});
		assert.strictEqual(payloads.length, 2);
		assert.strictEqual(payloads[0]!.uri, fileUri.toString());
		assert.strictEqual(payloads[1]!.uri, dirUri.toString());
	});

	test('prepareDroxNativeChatRunPrompt appends file reference block', async () => {
		const fileService = new FileService(new NullLogService());
		fileService.registerProvider(Schemas.file, new InMemoryFileSystemProvider());
		const readme = URI.file('/ws/README.md');
		await fileService.writeFile(readme, VSBuffer.fromString('# hello'));

		const attachmentsService: IDroxAttachmentsService = {
			_serviceBrand: undefined,
			persistAttachments: async () => [],
		};

		const result = await prepareDroxNativeChatRunPrompt(attachmentsService, fileService, {
			message: 'Explique ce fichier',
			variables: {
				variables: [{ id: 'f1', name: 'README.md', kind: 'file', value: readme }],
			},
			workspaceRoot: '/ws',
		});

		assert.strictEqual(result.ok, true);
		if (result.ok) {
			assert.ok(result.prompt.includes('[User references]'));
			assert.ok(result.prompt.includes('README.md'));
			assert.ok(result.prompt.includes('Explique ce fichier'));
		}
	});

	test('extractStandardPastePayloads reads native chat paste attachments', () => {
		const fileUri = URI.file('/ws/src/next.config.ts');
		const payloads = extractStandardPastePayloads({
			variables: [{
				id: 'paste-1',
				kind: 'paste',
				name: 'next.config.ts 3 lines',
				value: 'export default {}',
				code: 'export default {}',
				language: 'typescript',
				pastedLines: '3 lines',
				fileName: fileUri.toString(),
				copiedFrom: {
					uri: fileUri,
					range: { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 },
				},
			}],
		});
		assert.strictEqual(payloads.length, 1);
		assert.strictEqual(payloads[0]!.text, 'export default {}');
		assert.strictEqual(payloads[0]!.startLine, 1);
		assert.strictEqual(payloads[0]!.endLine, 3);
	});

	test('extractAllDroxPastePayloads merges file refs, smart paste and standard paste', async () => {
		const fileUri = URI.file('/ws/README.md');
		const smartPaste = toDroxSmartPasteVariableEntry('smart-1', {
			token: 'abc',
			kind: 'editor',
			absPath: '/ws/src/main.ts',
			relPath: 'src/main.ts',
			languageId: 'typescript',
			startLine: 1,
			endLine: 2,
			lineCount: 2,
			text: 'const x = 1;',
		});
		const standardPaste = {
			id: 'paste-1',
			kind: 'paste' as const,
			name: 'util.ts 1 line',
			value: 'return true;',
			code: 'return true;',
			language: 'typescript',
			pastedLines: '1 line',
			fileName: URI.file('/ws/util.ts').toString(),
			copiedFrom: {
				uri: URI.file('/ws/util.ts'),
				range: { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 1 },
			},
		};
		const all = extractAllDroxPastePayloads({ variables: [smartPaste, standardPaste] });
		assert.strictEqual(all.length, 2);

		const fileService = new FileService(new NullLogService());
		fileService.registerProvider(Schemas.file, new InMemoryFileSystemProvider());
		await fileService.writeFile(fileUri, VSBuffer.fromString('# hello'));
		const attachmentsService: IDroxAttachmentsService = {
			_serviceBrand: undefined,
			persistAttachments: async () => [],
		};
		const result = await prepareDroxNativeChatRunPrompt(attachmentsService, fileService, {
			message: 'Analyse',
			variables: {
				variables: [
					{ id: 'f1', name: 'README.md', kind: 'file', value: fileUri },
					smartPaste,
					standardPaste,
				],
			},
			workspaceRoot: '/ws',
		});
		assert.strictEqual(result.ok, true);
		if (result.ok) {
			assert.ok(result.prompt.includes('[User references]'));
			assert.ok(result.prompt.includes('[Smart paste — user-selected snippets]'));
			assert.ok(result.prompt.includes('src/main.ts'));
			assert.ok(result.prompt.includes('util.ts'));
			assert.ok(result.prompt.includes('const x = 1'));
			assert.ok(result.prompt.includes('return true'));
		}
	});
});
