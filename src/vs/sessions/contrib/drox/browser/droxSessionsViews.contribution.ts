/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Agents window hosts for Codebase + Regulation on the AuxiliaryBar
 * (same pane classes as IDE sidebar). Keeps the Sessions history list
 * visible on the left; cockpit opens beside the chat like Changes.
 */

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation, WindowEnablement } from '../../../../workbench/common/views.js';
import { DroxCodebaseCockpitViewPane } from '../../../../workbench/contrib/drox/browser/codebase/droxCodebaseCockpitViewPane.js';
import { DroxRegulationViewPane } from '../../../../workbench/contrib/drox/browser/regulation/droxRegulationViewPane.js';
import { DroxViews } from '../../../../workbench/contrib/drox/common/drox.js';

const codebaseSessionsIcon = registerIcon(
	'drox-codebase-sessions-view-icon',
	Codicon.database,
	localize('droxCodebaseSessionsViewIcon', 'View icon of the Drox Codebase cockpit (Agents).'),
);

const regulationSessionsIcon = registerIcon(
	'drox-regulation-sessions-view-icon',
	Codicon.pulse,
	localize('droxRegulationSessionsViewIcon', 'View icon of the Drox Regulation observatory (Agents).'),
);

const viewContainers = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const views = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

const codebaseSessionsContainer = viewContainers.registerViewContainer({
	id: DroxViews.CodebaseSessionsViewContainerId,
	title: localize2('drox.codebaseSessionsContainer.label', 'Codebase'),
	icon: codebaseSessionsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.CodebaseSessionsViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.CodebaseSessionsViewContainerId,
	hideIfEmpty: false,
	order: 20,
	windowEnablement: WindowEnablement.Sessions,
	openCommandActionDescriptor: {
		id: DroxViews.CodebaseSessionsViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxCodebaseSessions', comment: ['&& denotes a mnemonic'] }, "Code&&base"),
		order: 20,
	},
}, ViewContainerLocation.AuxiliaryBar);

views.registerViews([{
	id: DroxViews.CodebaseSessionsViewId,
	name: localize2('drox.codebaseSessionsView.label', 'Codebase'),
	containerIcon: codebaseSessionsIcon,
	containerTitle: localize('drox.codebaseSessionsContainer.title', 'Codebase'),
	singleViewPaneContainerTitle: localize('drox.codebaseSessionsContainer.title', 'Codebase'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	windowEnablement: WindowEnablement.Sessions,
	ctorDescriptor: new SyncDescriptor(DroxCodebaseCockpitViewPane),
}], codebaseSessionsContainer);

const regulationSessionsContainer = viewContainers.registerViewContainer({
	id: DroxViews.RegulationSessionsViewContainerId,
	title: localize2('drox.regulationSessionsContainer.label', 'Regulation'),
	icon: regulationSessionsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.RegulationSessionsViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.RegulationSessionsViewContainerId,
	hideIfEmpty: false,
	order: 21,
	windowEnablement: WindowEnablement.Sessions,
	openCommandActionDescriptor: {
		id: DroxViews.RegulationSessionsViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxRegulationSessions', comment: ['&& denotes a mnemonic'] }, "&&Regulation"),
		order: 21,
	},
}, ViewContainerLocation.AuxiliaryBar);

views.registerViews([{
	id: DroxViews.RegulationSessionsViewId,
	name: localize2('drox.regulationSessionsView.label', 'Regulation'),
	containerIcon: regulationSessionsIcon,
	containerTitle: localize('drox.regulationSessionsContainer.title', 'Regulation'),
	singleViewPaneContainerTitle: localize('drox.regulationSessionsContainer.title', 'Regulation'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	windowEnablement: WindowEnablement.Sessions,
	ctorDescriptor: new SyncDescriptor(DroxRegulationViewPane),
}], regulationSessionsContainer);
