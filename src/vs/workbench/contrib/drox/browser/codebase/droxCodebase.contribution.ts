/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation } from '../../../../common/views.js';
import { DroxViews } from '../../common/drox.js';
import { DroxCodebaseCockpitViewPane } from './droxCodebaseCockpitViewPane.js';

const codebaseViewIcon = registerIcon(
	'drox-codebase-view-icon',
	Codicon.database,
	localize('droxCodebaseViewIcon', 'View icon of the Drox Codebase cockpit.'),
);

const codebaseViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.CodebaseViewContainerId,
	title: localize2('drox.codebaseContainer.label', 'Codebase'),
	icon: codebaseViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.CodebaseViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.CodebaseViewContainerId,
	hideIfEmpty: false,
	order: 4,
	openCommandActionDescriptor: {
		id: DroxViews.CodebaseViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxCodebase', comment: ['&& denotes a mnemonic'] }, "Code&&base"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB,
		},
		order: 4,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.CodebaseViewId,
	name: localize2('drox.codebaseView.label', 'Codebase'),
	containerIcon: codebaseViewIcon,
	containerTitle: localize('drox.codebaseContainer.title', 'Codebase'),
	singleViewPaneContainerTitle: localize('drox.codebaseContainer.title', 'Codebase'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxCodebaseCockpitViewPane),
}], codebaseViewContainer);
