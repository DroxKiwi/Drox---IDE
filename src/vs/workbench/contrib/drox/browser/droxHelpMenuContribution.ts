/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DROX_ENGINE_DOCS_URL, DROX_PRODUCT_REPO_URL } from '../common/droxProductUrls.js';
function openExternalUrl(accessor: ServicesAccessor, url: string): void {
	accessor.get(IOpenerService).open(URI.parse(url));
}
function registerDroxHelpMenuActions(): void {
	registerAction2(class OpenDroxEngineDocsAction extends Action2 {
		static readonly ID = 'workbench.action.openDroxEngineDocs';
		constructor() {
			super({
				id: OpenDroxEngineDocsAction.ID,
				title: localize2('drox.openEngineDocs', 'Drox Engine Documentation'),
				category: Categories.Help,
				f1: true,
				menu: {
					id: MenuId.MenubarHelpMenu,
					group: '2_reference',
					order: 0,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			openExternalUrl(accessor, DROX_ENGINE_DOCS_URL);
		}
	});
	registerAction2(class OpenDroxRepositoryAction extends Action2 {
		static readonly ID = 'workbench.action.openDroxRepository';
		constructor() {
			super({
				id: OpenDroxRepositoryAction.ID,
				title: localize2('drox.openRepository', 'Drox IDE Repository'),
				category: Categories.Help,
				f1: true,
				menu: {
					id: MenuId.MenubarHelpMenu,
					group: '3_feedback',
					order: 0,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			openExternalUrl(accessor, DROX_PRODUCT_REPO_URL);
		}
	});
}
class DroxHelpMenuContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxHelpMenu';
	constructor(@IProductService productService: IProductService) {
		if (isDroxMicrosoftAgentsSurfaceEnabled(productService)) {
			return;
		}
		registerDroxHelpMenuActions();
	}
}
registerWorkbenchContribution2(
	DroxHelpMenuContribution.ID,
	DroxHelpMenuContribution,
	WorkbenchPhase.BlockRestore,
);
