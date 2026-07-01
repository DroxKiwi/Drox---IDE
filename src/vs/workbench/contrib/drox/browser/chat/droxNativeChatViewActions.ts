/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { DroxViews } from '../../common/drox.js';
import { DroxIdeNativeChatTabEnabledContext } from '../../common/droxAgentsConfiguration.js';
import { DroxNativeChatViewPane } from './droxNativeChatViewPane.js';

export function registerDroxNativeChatViewActions(): void {

	registerAction2(class DroxNativeNewChatAction extends Action2 {
		constructor() {
			super({
				id: 'drox.nativeChat.newChat',
				title: localize2('drox.nativeChat.newChat', 'New Chat'),
				icon: Codicon.plus,
				f1: false,
				precondition: DroxIdeNativeChatTabEnabledContext,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', DroxViews.NativeChatViewId),
					group: 'navigation',
					order: -1,
				}],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const pane = accessor.get(IViewsService).getViewWithId<DroxNativeChatViewPane>(DroxViews.NativeChatViewId);
			await pane?.startNewChat();
		}
	});

	registerAction2(class DroxNativePickSessionAction extends Action2 {
		constructor() {
			super({
				id: 'drox.nativeChat.pickSession',
				title: localize2('drox.nativeChat.pickSession', 'Open Session'),
				icon: Codicon.history,
				f1: false,
				precondition: DroxIdeNativeChatTabEnabledContext,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', DroxViews.NativeChatViewId),
					group: 'navigation',
					order: -2,
				}],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const pane = accessor.get(IViewsService).getViewWithId<DroxNativeChatViewPane>(DroxViews.NativeChatViewId);
			await pane?.pickSession();
		}
	});
}
