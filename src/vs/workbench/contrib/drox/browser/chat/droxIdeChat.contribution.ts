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
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions } from '../../../../common/views.js';
import { DroxViews } from '../../common/drox.js';
import { DroxIdeNativeChatTabEnabledContext } from '../../common/droxAgentsConfiguration.js';
import { DroxNativeChatViewPane } from './droxNativeChatViewPane.js';
import { registerDroxNativeChatViewActions } from './droxNativeChatViewActions.js';

registerDroxNativeChatViewActions();

const droxNativeChatViewIcon = registerIcon(
	'drox-native-chat-view-icon',
	Codicon.sparkle,
	localize('droxNativeChatViewIcon', 'View icon of the Drox native chat tab.'),
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
