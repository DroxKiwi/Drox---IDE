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
import { deleteDroxSessionOnDisk, droxSessionArtifactPaths } from '../../common/droxSessionDeleteFs.js';

suite('droxSessionDeleteFs', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('deleteDroxSessionOnDisk removes transcript and auxiliary files', async () => {
		const fileService = new FileService(new NullLogService());
		fileService.registerProvider(Schemas.file, new InMemoryFileSystemProvider());

		const workspaceFsPath = '/ws';
		const sessionId = 'ses_test-delete';
		for (const path of droxSessionArtifactPaths(workspaceFsPath, sessionId)) {
			await fileService.writeFile(URI.file(path), VSBuffer.fromString(''));
		}

		await deleteDroxSessionOnDisk(fileService, workspaceFsPath, sessionId);

		for (const path of droxSessionArtifactPaths(workspaceFsPath, sessionId)) {
			assert.strictEqual(await fileService.exists(URI.file(path)), false, path);
		}
	});
});
