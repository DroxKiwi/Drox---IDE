/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { testDroxLlmConnectionDraft } from '../../browser/chat/droxChatConnectionTest.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';

suite('Drox connection test timeout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('hanging fetchHttp surfaces a timeout instead of spinning forever', async () => {
		const result = await testDroxLlmConnectionDraft(
			{
				droxEngineService: {
					fetchHttp: () => new Promise(() => { }),
				} as unknown as IDroxEngineService,
				requestService: {} as IRequestService,
			},
			{ llmProvider: 'ollama', server: 'http://127.0.0.1:11434' },
			{ timeoutMs: 40 },
		);
		assert.strictEqual(result.ok, false);
		assert.ok(/timed out/i.test(result.error ?? ''));
	});
});
