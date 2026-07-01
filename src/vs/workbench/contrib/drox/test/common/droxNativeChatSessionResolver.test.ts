/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { resolveDroxNativeChatStartupSessionId } from '../../common/droxNativeChatSessionResolver.js';

suite('droxNativeChatSessionResolver', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers persisted native session when listable', async () => {
		const sessionService: Pick<IDroxSessionService, 'listSessions'> = {
			listSessions: async () => [
				{ id: 'ses_old', modifiedSecs: 1, sizeBytes: 10 },
				{ id: 'ses_persisted', modifiedSecs: 2, sizeBytes: 20, title: 'Hello' },
			],
		};
		const result = await resolveDroxNativeChatStartupSessionId({
			workspaceFsPath: '/ws',
			sessionService: sessionService as IDroxSessionService,
			persistedNativeSessionId: 'ses_persisted',
			webviewActiveTabId: 'ses_old',
			createNewSessionId: () => 'ses_new',
		});
		assert.strictEqual(result.sessionId, 'ses_persisted');
	});

	test('falls back to newest listed session', async () => {
		const sessionService: Pick<IDroxSessionService, 'listSessions'> = {
			listSessions: async () => [
				{ id: 'ses_old', modifiedSecs: 1, sizeBytes: 10 },
				{ id: 'ses_newest', modifiedSecs: 99, sizeBytes: 20 },
			],
		};
		const result = await resolveDroxNativeChatStartupSessionId({
			workspaceFsPath: '/ws',
			sessionService: sessionService as IDroxSessionService,
			createNewSessionId: () => 'ses_brand_new',
		});
		assert.strictEqual(result.sessionId, 'ses_newest');
	});

	test('creates new session when disk is empty', async () => {
		const sessionService: Pick<IDroxSessionService, 'listSessions'> = {
			listSessions: async () => [],
		};
		const result = await resolveDroxNativeChatStartupSessionId({
			workspaceFsPath: '/ws',
			sessionService: sessionService as IDroxSessionService,
			createNewSessionId: () => 'ses_brand_new',
		});
		assert.strictEqual(result.sessionId, 'ses_brand_new');
	});
});
