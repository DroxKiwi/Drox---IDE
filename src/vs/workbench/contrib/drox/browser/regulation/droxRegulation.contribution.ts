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
import { DroxRegulationViewPane } from './droxRegulationViewPane.js';

const regulationViewIcon = registerIcon(
	'drox-regulation-view-icon',
	Codicon.pulse,
	localize('droxRegulationViewIcon', 'View icon of the Drox Model regulation observatory.'),
);

const regulationViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.RegulationViewContainerId,
	title: localize2('drox.regulationContainer.label', 'Regulation'),
	icon: regulationViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.RegulationViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.RegulationViewContainerId,
	hideIfEmpty: false,
	order: 5,
	openCommandActionDescriptor: {
		id: DroxViews.RegulationViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxRegulation', comment: ['&& denotes a mnemonic'] }, "&&Regulation"),
		order: 5,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.RegulationViewId,
	name: localize2('drox.regulationView.label', 'Regulation'),
	containerIcon: regulationViewIcon,
	containerTitle: localize('drox.regulationContainer.title', 'Regulation'),
	singleViewPaneContainerTitle: localize('drox.regulationContainer.title', 'Regulation'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxRegulationViewPane),
}], regulationViewContainer);
