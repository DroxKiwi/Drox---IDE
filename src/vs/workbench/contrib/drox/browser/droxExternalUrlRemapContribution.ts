/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { matchesSomeScheme, Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService, OpenOptions } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { remapDroxOutboundUrl, shouldRemapDroxOutboundUrls } from '../common/droxExternalUrlRemap.js';
class DroxExternalUrlRemapContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxExternalUrlRemap';
	constructor(
		@IOpenerService openerService: IOpenerService,
		@IProductService productService: IProductService,
	) {
		if (!shouldRemapDroxOutboundUrls(productService)) {
			return;
		}
		openerService.registerOpener({
			open: async (target: URI | string, options?: OpenOptions) => {
				const href = typeof target === 'string' ? target : target.toString(true);
				const uri = typeof target === 'string' ? URI.parse(target) : target;
				if (!matchesSomeScheme(uri, Schemas.http, Schemas.https)) {
					return false;
				}
				const remapped = remapDroxOutboundUrl(href, productService);
				if (remapped === href) {
					return false;
				}
				await openerService.open(remapped, { ...options, skipValidation: true });
				return true;
			},
		});
	}
}
registerWorkbenchContribution2(
	DroxExternalUrlRemapContribution.ID,
	DroxExternalUrlRemapContribution,
	WorkbenchPhase.BlockRestore,
);
