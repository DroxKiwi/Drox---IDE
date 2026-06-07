/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { remapDroxOutboundUrl } from '../../common/droxExternalUrlRemap.js';
import { DROX_PRODUCT_NOTICE_URL } from '../../common/droxProductUrls.js';
const DROX_PRODUCT = { droxMicrosoftAgentsSurfaceEnabled: false as const };
suite('Drox external URL remap', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('remaps aka.ms to NOTICE', () => {
		const out = remapDroxOutboundUrl('https://aka.ms/vscode-getting-started-video', DROX_PRODUCT);
		assert.strictEqual(out, DROX_PRODUCT_NOTICE_URL);
	});
	test('remaps Copilot API docs to NOTICE', () => {
		const out = remapDroxOutboundUrl('https://api.github.com/copilot_internal/user', DROX_PRODUCT);
		assert.strictEqual(out, DROX_PRODUCT_NOTICE_URL);
	});
	test('keeps Drox GitHub links', () => {
		const url = 'https://github.com/DroxKiwi/Drox---IDE---OR/issues/new';
		assert.strictEqual(remapDroxOutboundUrl(url, DROX_PRODUCT), url);
	});
	test('keeps localhost Ollama', () => {
		const url = 'http://localhost:11434/v1';
		assert.strictEqual(remapDroxOutboundUrl(url, DROX_PRODUCT), url);
	});
	test('passes through when Microsoft surface enabled', () => {
		const url = 'https://aka.ms/foo';
		assert.strictEqual(
			remapDroxOutboundUrl(url, { droxMicrosoftAgentsSurfaceEnabled: true }),
			url,
		);
	});
});
