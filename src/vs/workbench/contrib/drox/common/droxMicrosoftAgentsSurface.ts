/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

/**
 * When true, Drox hides the Microsoft / VS Code Chat panel (`workbench.panel.chat`)
 * and related Copilot surfaces. Bound early at BlockStartup from `product.json`.
 * Chat contrib uses the string key only (no import from drox → avoids cycles).
 */
export const DroxHideMicrosoftChatSurfaceContextKey = new RawContextKey<boolean>(
	'droxHideMicrosoftChatSurface',
	false,
	{ type: 'boolean', description: localize('droxHideMicrosoftChatSurface', 'True when Drox hides the built-in Microsoft Chat panel.') },
);

export const DroxHideMicrosoftChatSurfaceContext = ContextKeyExpr.equals(DroxHideMicrosoftChatSurfaceContextKey.key, true);

/** Microsoft Agents / VS Code chat UI — off unless `product.json` explicitly enables. */
export function isDroxMicrosoftAgentsSurfaceEnabled(productService: Pick<IProductService, 'droxMicrosoftAgentsSurfaceEnabled'>): boolean {
	return productService.droxMicrosoftAgentsSurfaceEnabled === true;
}

/** True when the product should hide the Microsoft Chat panel and Copilot shell UI. */
export function shouldHideDroxMicrosoftChatSurface(productService: Pick<IProductService, 'droxMicrosoftAgentsSurfaceEnabled'>): boolean {
	return !isDroxMicrosoftAgentsSurfaceEnabled(productService);
}
