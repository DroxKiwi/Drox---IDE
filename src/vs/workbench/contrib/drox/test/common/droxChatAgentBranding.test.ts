/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DROX_DEFAULT_CHAT_AGENT_DISPLAY_NAME, getDefaultChatAgentDisplayName } from '../../common/droxChatAgentBranding.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';

suite('DroxChatAgentBranding', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getDefaultChatAgentDisplayName uses product default', () => {
		const productService = {
			defaultChatAgent: { provider: { default: { name: 'Drox' } } },
		} as IProductService;
		assert.strictEqual(getDefaultChatAgentDisplayName(productService), 'Drox');
	});

	test('getDefaultChatAgentDisplayName falls back to Drox', () => {
		const productService = {} as IProductService;
		assert.strictEqual(getDefaultChatAgentDisplayName(productService), DROX_DEFAULT_CHAT_AGENT_DISPLAY_NAME);
	});
});
