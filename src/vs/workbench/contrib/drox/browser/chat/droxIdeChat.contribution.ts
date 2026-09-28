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
import { DroxIdeNativeChatTabEnabledContext } from '../../common/droxAgentsConfiguration.js';
import { DroxNativeChatViewPane } from './droxNativeChatViewPane.js';
import { DroxIdeChangesViewPane } from './droxIdeChangesViewPane.js';
import { registerDroxNativeChatViewActions } from './droxNativeChatViewActions.js';
import './droxIdeSessionChangesBridge.contribution.js';
import './droxIdeGitComposer.contribution.js';

registerDroxNativeChatViewActions();

const droxNativeChatViewIcon = registerIcon(
	'drox-native-chat-view-icon',
	Codicon.sparkle,
	localize('droxNativeChatViewIcon', 'View icon of the Drox native chat tab.'),
);

const droxChangesViewIcon = registerIcon(
	'drox-ide-changes-view-icon',
	Codicon.gitCompare,
	localize('droxIdeChangesViewIcon', 'View icon of the Drox Changes panel.'),
);

// Loaded after `drox.contribution` (workbench.common.main) — resolve container by id, no circular import.
const droxViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(DroxViews.ViewContainerId);
if (droxViewContainer) {
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
		id: DroxViews.NativeChatViewId,
		name: localize2('drox.nativeChatView.label', 'Drox'),
		containerIcon: droxNativeChatViewIcon,
		containerTitle: droxViewContainer.title.value,
		canToggleVisibility: true,
		canMoveView: false,
		order: 0,
		ctorDescriptor: new SyncDescriptor(DroxNativeChatViewPane),
		when: DroxIdeNativeChatTabEnabledContext,
	}], droxViewContainer);
}

/** Sidebar activity-bar entry — replaces Explorer when opened (SCM-like). */
const changesViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.ChangesViewContainerId,
	title: localize2('drox.ideChangesContainer.label', 'Changes'),
	icon: droxChangesViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.ChangesViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.ChangesViewContainerId,
	hideIfEmpty: false,
	order: 3,
	openCommandActionDescriptor: {
		id: DroxViews.ChangesViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxChanges', comment: ['&& denotes a mnemonic'] }, "Chan&&ges"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
		},
		order: 3,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.ChangesViewId,
	name: localize2('drox.ideChangesView.label', 'Changes'),
	containerIcon: droxChangesViewIcon,
	containerTitle: localize('drox.ideChangesContainer.title', 'Changes'),
	singleViewPaneContainerTitle: localize('drox.ideChangesContainer.title', 'Changes'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxIdeChangesViewPane),
	when: DroxIdeNativeChatTabEnabledContext,
}], changesViewContainer);
