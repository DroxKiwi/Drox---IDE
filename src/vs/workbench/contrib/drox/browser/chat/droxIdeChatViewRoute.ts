/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import {
	isDroxIdeLegacyWebviewChatEnabled,
	isDroxIdeNativeChatTabEnabled,
} from '../../common/droxAgentsConfiguration.js';
import { DroxViews } from '../../common/drox.js';
import { DroxNativeChatViewPane } from './droxNativeChatViewPane.js';

/** Vue chat IDE à ouvrir : natif par défaut, webview legacy si seul canal actif. */
export function resolveDroxIdeChatViewId(configurationService: IConfigurationService): string {
	if (isDroxIdeNativeChatTabEnabled(configurationService)) {
		return DroxViews.NativeChatViewId;
	}
	if (isDroxIdeLegacyWebviewChatEnabled(configurationService)) {
		return DroxViews.ChatViewId;
	}
	return DroxViews.NativeChatViewId;
}

export async function openDroxIdeChatView(accessor: ServicesAccessor, focus = true): Promise<void> {
	const layoutService = accessor.get(IWorkbenchLayoutService);
	const viewsService = accessor.get(IViewsService);
	const configurationService = accessor.get(IConfigurationService);
	if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
		layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
	}
	await viewsService.openView(resolveDroxIdeChatViewId(configurationService), focus);
}

export async function startDroxIdeNewChat(accessor: ServicesAccessor): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const viewsService = accessor.get(IViewsService);
	await openDroxIdeChatView(accessor, true);
	if (isDroxIdeNativeChatTabEnabled(configurationService)) {
		const pane = viewsService.getViewWithId<DroxNativeChatViewPane>(DroxViews.NativeChatViewId);
		await pane?.startNewChat();
	}
}
