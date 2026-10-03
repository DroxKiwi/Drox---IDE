/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Agents window hosts for Codebase + Regulation + Traffic + Ports on the AuxiliaryBar
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
import { DroxPortsViewPane } from '../../../../workbench/contrib/drox/browser/ports/droxPortsViewPane.js';
import { DroxRegulationViewPane } from '../../../../workbench/contrib/drox/browser/regulation/droxRegulationViewPane.js';
import { DroxTrafficViewPane } from '../../../../workbench/contrib/drox/browser/traffic/droxTrafficViewPane.js';
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

const trafficSessionsIcon = registerIcon(
	'drox-traffic-sessions-view-icon',
	Codicon.radioTower,
	localize('droxTrafficSessionsViewIcon', 'View icon of the Drox traffic observatory (Agents).'),
);

const portsSessionsIcon = registerIcon(
	'drox-ports-sessions-view-icon',
	Codicon.plug,
	localize('droxPortsSessionsViewIcon', 'View icon of the Drox ports / forward panel (Agents).'),
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

const trafficSessionsContainer = viewContainers.registerViewContainer({
	id: DroxViews.TrafficSessionsViewContainerId,
	title: localize2('drox.trafficSessionsContainer.label', 'Traffic'),
	icon: trafficSessionsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.TrafficSessionsViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.TrafficSessionsViewContainerId,
	hideIfEmpty: false,
	order: 22,
	windowEnablement: WindowEnablement.Sessions,
	openCommandActionDescriptor: {
		id: DroxViews.TrafficSessionsViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxTrafficSessions', comment: ['&& denotes a mnemonic'] }, "&&Traffic"),
		order: 22,
	},
}, ViewContainerLocation.AuxiliaryBar);

views.registerViews([{
	id: DroxViews.TrafficSessionsViewId,
	name: localize2('drox.trafficSessionsView.label', 'Traffic'),
	containerIcon: trafficSessionsIcon,
	containerTitle: localize('drox.trafficSessionsContainer.title', 'Traffic'),
	singleViewPaneContainerTitle: localize('drox.trafficSessionsContainer.title', 'Traffic'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	windowEnablement: WindowEnablement.Sessions,
	ctorDescriptor: new SyncDescriptor(DroxTrafficViewPane),
}], trafficSessionsContainer);

const portsSessionsContainer = viewContainers.registerViewContainer({
	id: DroxViews.PortsSessionsViewContainerId,
	title: localize2('drox.portsSessionsContainer.label', 'Ports'),
	icon: portsSessionsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.PortsSessionsViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.PortsSessionsViewContainerId,
	hideIfEmpty: false,
	order: 23,
	windowEnablement: WindowEnablement.Sessions,
	openCommandActionDescriptor: {
		id: DroxViews.PortsSessionsViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxPortsSessions', comment: ['&& denotes a mnemonic'] }, "&&Ports"),
		order: 23,
	},
}, ViewContainerLocation.AuxiliaryBar);

views.registerViews([{
	id: DroxViews.PortsSessionsViewId,
	name: localize2('drox.portsSessionsView.label', 'Ports'),
	containerIcon: portsSessionsIcon,
	containerTitle: localize('drox.portsSessionsContainer.title', 'Ports'),
	singleViewPaneContainerTitle: localize('drox.portsSessionsContainer.title', 'Ports'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	windowEnablement: WindowEnablement.Sessions,
	ctorDescriptor: new SyncDescriptor(DroxPortsViewPane),
}], portsSessionsContainer);
