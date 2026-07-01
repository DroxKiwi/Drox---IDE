/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, IViewDescriptorService, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { DroxViews } from '../common/drox.js';
import { DroxIdeLegacyWebviewChatEnabledContext } from '../common/droxAgentsConfiguration.js';
import '../common/droxSettingMigration.js';
import { registerDroxConfiguration } from '../common/droxConfiguration.js';
import { registerDroxProductDefaultsConfiguration } from '../common/droxProductDefaultsConfiguration.js';
import { DroxChatViewPane } from './droxChatViewPane.js';
import { registerDroxActions } from './droxActions.js';
import { DroxDiagnosticContribution } from './droxDiagnosticContribution.js';
import './droxMicrosoftAgentsSurfaceContribution.js';
import './agents/droxAgentsComposerDroxChatHost.js';
import './droxCopilotSignInContextContribution.js';
import './droxTelemetryContribution.js';
import './droxExternalUrlRemapContribution.js';
import './droxHelpMenuContribution.js';
import './droxReleaseNotesContribution.js';

registerDroxConfiguration();
registerDroxProductDefaultsConfiguration();
registerDroxActions();

const droxViewIcon = registerIcon('drox-view-icon', Codicon.commentDiscussion, localize('droxViewIcon', 'View icon of the Drox agent view.'));

export const droxViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.ViewContainerId,
	title: localize2('drox.viewContainer.label', 'Drox'),
	icon: droxViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.ViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.ViewContainerId,
	order: 0,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.ChatViewId,
	name: localize2('drox.legacyChatView.label', 'Webview'),
	containerIcon: droxViewIcon,
	containerTitle: droxViewContainer.title.value,
	singleViewPaneContainerTitle: droxViewContainer.title.value,
	canToggleVisibility: true,
	canMoveView: true,
	order: 1,
	ctorDescriptor: new SyncDescriptor(DroxChatViewPane),
	when: DroxIdeLegacyWebviewChatEnabledContext,
}], droxViewContainer);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DroxDiagnosticContribution,
	LifecyclePhase.Restored,
);

/** Layout Nexus : Drox seul dans la barre auxiliaire (pas d’onglets Copilot/Terminal en bas). */
class DroxAuxiliaryBarLayoutContribution implements IWorkbenchContribution {
	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		const droxContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(DroxViews.ViewContainerId);
		if (droxContainer && this.viewDescriptorService.getViewContainerLocation(droxContainer) === ViewContainerLocation.Sidebar) {
			this.viewDescriptorService.moveViewContainerToLocation(droxContainer, ViewContainerLocation.AuxiliaryBar, 0, 'drox-ide-auxiliary-bar');
		}

		for (const container of this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)) {
			if (container.id === DroxViews.ViewContainerId) {
				continue;
			}
			this.viewDescriptorService.moveViewContainerToLocation(container, ViewContainerLocation.Panel, undefined, 'drox-ide-exclusive-aux');
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DroxAuxiliaryBarLayoutContribution,
	LifecyclePhase.Restored,
);
