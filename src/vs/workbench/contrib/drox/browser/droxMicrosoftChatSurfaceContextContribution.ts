/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DroxHideMicrosoftChatSurfaceContextKey, shouldHideDroxMicrosoftChatSurface } from '../common/droxMicrosoftAgentsSurface.js';

/** Bind `droxHideMicrosoftChatSurface` before view `when` clauses evaluate. */
class DroxMicrosoftChatSurfaceContextContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxMicrosoftChatSurfaceContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
	) {
		DroxHideMicrosoftChatSurfaceContextKey.bindTo(contextKeyService).set(shouldHideDroxMicrosoftChatSurface(productService));
	}
}

registerWorkbenchContribution2(
	DroxMicrosoftChatSurfaceContextContribution.ID,
	DroxMicrosoftChatSurfaceContextContribution,
	WorkbenchPhase.BlockStartup,
);
