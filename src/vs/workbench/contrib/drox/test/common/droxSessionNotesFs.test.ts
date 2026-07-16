/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Schemas } from '../../../../../base/common/network.js';
import {
	DROX_SESSION_NOTES_TEMPLATE,
	ensureDroxSessionNotesFile,
	readDroxSessionNotesSystemSupplement,
} from '../../common/droxSessionNotesFs.js';
import { droxSessionArtifactPaths } from '../../common/droxSessionDeleteFs.js';

suite('droxSessionNotesFs', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ensure creates template once and does not overwrite', async () => {
		const fileService = new FileService(new NullLogService());
		fileService.registerProvider(Schemas.file, new InMemoryFileSystemProvider());
		const workspaceFsPath = '/ws';
		const sessionId = 'ses_notes_test';

		const uri = await ensureDroxSessionNotesFile(fileService, workspaceFsPath, sessionId);
		assert.ok(uri);
		assert.strictEqual(uri!.toString(), URI.file(`/ws/.drox/sessions/${sessionId}.notes.md`).toString());
		assert.strictEqual((await fileService.readFile(uri!)).value.toString(), DROX_SESSION_NOTES_TEMPLATE);

		await fileService.writeFile(uri!, VSBuffer.fromString('# Custom\n'));
		const again = await ensureDroxSessionNotesFile(fileService, workspaceFsPath, sessionId);
		assert.strictEqual((await fileService.readFile(again!)).value.toString(), '# Custom\n');
	});

	test('system supplement wraps notes and lists notes in delete artefacts', async () => {
		const fileService = new FileService(new NullLogService());
		fileService.registerProvider(Schemas.file, new InMemoryFileSystemProvider());
		const workspaceFsPath = '/ws';
		const sessionId = 'ses_notes_inject';
		const uri = await ensureDroxSessionNotesFile(fileService, workspaceFsPath, sessionId);
		await fileService.writeFile(uri!, VSBuffer.fromString('Prefer concise answers.'));

		const system = await readDroxSessionNotesSystemSupplement(fileService, workspaceFsPath, sessionId);
		assert.ok(system?.includes('[Session notes'));
		assert.ok(system?.includes('Prefer concise answers.'));

		const paths = droxSessionArtifactPaths(workspaceFsPath, sessionId);
		assert.ok(paths.some(p => p.endsWith(`${sessionId}.notes.md`)));
	});
});
