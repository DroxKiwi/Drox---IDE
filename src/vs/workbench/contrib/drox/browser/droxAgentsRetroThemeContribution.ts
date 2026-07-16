/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxAgentsRetroTheme.css';
import './media/droxLoadingKit.css';
import './agents/media/droxNativeFileChange.css';
import '../common/droxAgentsThemeColors.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { shouldSkipDroxSessionsSignIn } from '../common/droxAgentsConfiguration.js';

/** Thème rétro Drox (vert / brun) pour la fenêtre Agents. */
class DroxAgentsRetroThemeContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxAgentsRetroTheme';

	constructor(
		@IProductService productService: IProductService,
	) {
		if (!shouldSkipDroxSessionsSignIn(productService)) {
			return;
		}
		document.body.classList.add('drox-agents-retro-active');
	}
}

registerWorkbenchContribution2(
	DroxAgentsRetroThemeContribution.ID,
	DroxAgentsRetroThemeContribution,
	WorkbenchPhase.BlockStartup,
);
