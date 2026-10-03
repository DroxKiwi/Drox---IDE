/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation } from '../../../../common/views.js';
import { DroxViews } from '../../common/drox.js';
import { DroxTrafficViewPane } from './droxTrafficViewPane.js';

const trafficViewIcon = registerIcon(
	'drox-traffic-view-icon',
	Codicon.radioTower,
	localize('droxTrafficViewIcon', 'View icon of the Drox traffic observatory.'),
);

/** IDE only — Agents hosts a dedicated AuxiliaryBar copy in droxSessionsViews.contribution. */
const trafficViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.TrafficViewContainerId,
	title: localize2('drox.trafficContainer.label', 'Traffic'),
	icon: trafficViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.TrafficViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.TrafficViewContainerId,
	hideIfEmpty: false,
	order: 6,
	openCommandActionDescriptor: {
		id: DroxViews.TrafficViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxTraffic', comment: ['&& denotes a mnemonic'] }, "&&Traffic"),
		order: 6,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.TrafficViewId,
	name: localize2('drox.trafficView.label', 'Traffic'),
	containerIcon: trafficViewIcon,
	containerTitle: localize('drox.trafficContainer.title', 'Traffic'),
	singleViewPaneContainerTitle: localize('drox.trafficContainer.title', 'Traffic'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxTrafficViewPane),
}], trafficViewContainer);
