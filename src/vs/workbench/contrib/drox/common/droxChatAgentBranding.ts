/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IProductService } from '../../../../platform/product/common/productService.js';

export const DROX_DEFAULT_CHAT_AGENT_DISPLAY_NAME = 'Drox';

/** Product chat agent label (`product.defaultChatAgent.provider.default.name`). */
export function getDefaultChatAgentDisplayName(productService: IProductService): string {
	return productService.defaultChatAgent?.provider?.default?.name ?? DROX_DEFAULT_CHAT_AGENT_DISPLAY_NAME;
}
