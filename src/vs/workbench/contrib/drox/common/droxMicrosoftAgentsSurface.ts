/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IProductService } from '../../../../platform/product/common/productService.js';

/** Microsoft Agents / VS Code chat UI — off unless `product.json` explicitly enables. */
export function isDroxMicrosoftAgentsSurfaceEnabled(productService: IProductService): boolean {
	return productService.droxMicrosoftAgentsSurfaceEnabled === true;
}
