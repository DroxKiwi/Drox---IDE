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
import { DroxPortsViewPane } from './droxPortsViewPane.js';

const portsViewIcon = registerIcon(
	'drox-ports-view-icon',
	Codicon.plug,
	localize('droxPortsViewIcon', 'View icon of the Drox ports / forward panel.'),
);

/** IDE only — Agents hosts a dedicated AuxiliaryBar copy in droxSessionsViews.contribution. */
const portsViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.PortsViewContainerId,
	title: localize2('drox.portsContainer.label', 'Ports'),
	icon: portsViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.PortsViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.PortsViewContainerId,
	hideIfEmpty: false,
	order: 7,
	openCommandActionDescriptor: {
		id: DroxViews.PortsViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxPorts', comment: ['&& denotes a mnemonic'] }, "&&Ports"),
		order: 7,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.PortsViewId,
	name: localize2('drox.portsView.label', 'Ports'),
	containerIcon: portsViewIcon,
	containerTitle: localize('drox.portsContainer.title', 'Ports'),
	singleViewPaneContainerTitle: localize('drox.portsContainer.title', 'Ports'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxPortsViewPane),
}], portsViewContainer);
