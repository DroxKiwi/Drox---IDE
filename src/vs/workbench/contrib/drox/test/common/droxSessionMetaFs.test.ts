/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Schemas } from '../../../../../base/common/network.js';
import { readDroxSessionMeta, writeDroxSessionMeta } from '../../common/droxSessionMetaFs.js';

suite('droxSessionMetaFs', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('write and read custom session title', async () => {
		const fileService = new FileService(new NullLogService());
		const provider = new InMemoryFileSystemProvider();
		const registration = fileService.registerProvider(Schemas.file, provider);
		try {
			await writeDroxSessionMeta(fileService, '/ws', 'ses_rename_test', { customTitle: 'Mon titre' });
			const meta = await readDroxSessionMeta(fileService, '/ws', 'ses_rename_test');
			assert.strictEqual(meta?.customTitle, 'Mon titre');
			assert.strictEqual(await fileService.exists(URI.file('/ws/.drox/sessions/ses_rename_test.meta.json')), true);
		} finally {
			registration.dispose();
			provider.dispose();
			fileService.dispose();
		}
	});
});
