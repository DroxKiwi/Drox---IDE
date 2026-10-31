/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxRunCapture.css';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
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
import { DroxRunCaptureArmedContext, isDroxRunCaptureArmed, setDroxRunCaptureArmed } from '../../common/droxRunCapture.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { exportDroxSessionTranscript } from './droxChatTranscriptExport.js';
import { DroxNativeChatViewPane } from './droxNativeChatViewPane.js';

/** Un clic sur l'icône bug déclenche parfois l'action deux fois. */
let runCaptureToggleGuard = false;

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
				title: localize2('drox.nativeChat.pickSession', 'Session History'),
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

	registerAction2(class DroxNativeRunCaptureAction extends Action2 {
		constructor() {
			super({
				id: 'drox.nativeChat.runCapture',
				title: localize2('drox.nativeChat.runCapture', 'Arm debug capture'),
				icon: Codicon.bug,
				f1: false,
				toggled: {
					condition: DroxRunCaptureArmedContext,
					icon: Codicon.record,
					title: localize('drox.nativeChat.runCapture.stop', 'Capture on — click to stop and export'),
					tooltip: localize('drox.nativeChat.runCapture.stopTip', 'Capture on. Click again at the end of the discussion to export.'),
				},
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.or(
						ContextKeyExpr.equals('view', DroxViews.NativeChatViewId),
						ContextKeyExpr.equals('view', DroxViews.ChatViewId),
					),
					group: 'navigation',
					order: 9,
				}],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			if (runCaptureToggleGuard) {
				return;
			}
			runCaptureToggleGuard = true;
			setTimeout(() => {
				runCaptureToggleGuard = false;
			}, 400);
			const productService = accessor.get(IProductService);
			if (!isDroxDevFeatureEnabled('runCapture', productService)) {
				return;
			}
			const notificationService = accessor.get(INotificationService);
			const recording = !isDroxRunCaptureArmed();
			setDroxRunCaptureArmed(recording);
			DroxRunCaptureArmedContext.bindTo(accessor.get(IContextKeyService)).set(recording);
			if (recording) {
				notificationService.info(localize(
					'drox.nativeChat.runCapture.armed',
					'Debug capture is on. Send your messages, then click the red icon at the end to export.',
				));
				return;
			}
			const native = accessor.get(IViewsService).getViewWithId<DroxNativeChatViewPane>(DroxViews.NativeChatViewId);
			const sessionId = accessor.get(IDroxChatSessionService).getSessionId() ?? native?.engineSessionId;
			await exportDroxSessionTranscript({
				sessionId,
				sessionService: accessor.get(IDroxSessionService),
				workspaceContextService: accessor.get(IWorkspaceContextService),
				clipboardService: accessor.get(IClipboardService),
				notificationService: accessor.get(INotificationService),
				productService,
				fileService: accessor.get(IFileService),
				droxEngineService: accessor.get(IDroxEngineService),
				quietIfEmpty: true,
			});
			notificationService.info(localize(
				'drox.nativeChat.runCapture.stopped',
				'Debug capture is off.',
			));
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
