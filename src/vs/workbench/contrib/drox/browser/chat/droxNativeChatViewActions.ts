/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { DroxViews } from '../../common/drox.js';
import { DroxIdeNativeChatTabEnabledContext } from '../../common/droxAgentsConfiguration.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { exportDroxSessionTranscript } from './droxChatTranscriptExport.js';
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

	registerAction2(class DroxNativeExportTranscriptAction extends Action2 {
		constructor() {
			super({
				id: 'drox.nativeChat.exportTranscript',
				title: localize2('drox.nativeChat.exportTranscript', 'Export Full Transcript (Dev)'),
				icon: Codicon.export,
				f1: true,
				precondition: DroxIdeNativeChatTabEnabledContext,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', DroxViews.NativeChatViewId),
					group: 'navigation',
					order: 10,
				}],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const productService = accessor.get(IProductService);
			if (!isDroxDevFeatureEnabled('exportTranscript', productService)) {
				accessor.get(INotificationService).warn(
					localize('drox.nativeChat.exportDevOnly', 'Export transcript is only available in the dev surface.'),
				);
				return;
			}
			const pane = accessor.get(IViewsService).getViewWithId<DroxNativeChatViewPane>(DroxViews.NativeChatViewId);
			await exportDroxSessionTranscript({
				sessionId: pane?.engineSessionId,
				sessionService: accessor.get(IDroxSessionService),
				workspaceContextService: accessor.get(IWorkspaceContextService),
				clipboardService: accessor.get(IClipboardService),
				notificationService: accessor.get(INotificationService),
				productService,
				fileService: accessor.get(IFileService),
			});
		}
	});

	registerAction2(class DroxNativeResetWorkspaceAction extends Action2 {
		constructor() {
			super({
				id: 'drox.nativeChat.resetWorkspace',
				title: localize2('drox.nativeChat.resetWorkspace', 'Reset Drox Data for This Workspace'),
				icon: Codicon.trash,
				f1: true,
				precondition: DroxIdeNativeChatTabEnabledContext,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', DroxViews.NativeChatViewId),
					group: 'navigation',
					order: 20,
				}],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const pane = accessor.get(IViewsService).getViewWithId<DroxNativeChatViewPane>(DroxViews.NativeChatViewId);
			await pane?.resetWorkspaceDroxData();
		}
	});
}
