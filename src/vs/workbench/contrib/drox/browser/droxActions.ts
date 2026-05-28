/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize, localize2 } from '../../../../nls.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { DroxCommands, DroxViews } from '../common/drox.js';
import { IDroxRefsBridgeService } from '../common/droxRefsBridgeService.js';
import { IDroxComposerBridgeService } from '../common/droxComposerBridgeService.js';
import { IDroxRunRevertService } from '../common/droxRunRevertService.js';

/** Search query for the Settings UI — all `drox.*` keys. */
export const DROX_SETTINGS_SEARCH_QUERY = 'drox';

const DROX_CATEGORY = localize2('drox.category', 'Drox');

async function openDroxChatPanel(accessor: ServicesAccessor): Promise<void> {
	const layoutService = accessor.get(IWorkbenchLayoutService);
	const viewsService = accessor.get(IViewsService);
	if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
		layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
	}
	await viewsService.openView(DroxViews.ChatViewId, true);
}

export function registerDroxActions(): void {
	registerAction2(class OpenDroxChatAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.OpenChat,
				title: localize2('drox.openChat', 'Open Drox'),
				category: DROX_CATEGORY,
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib + 50,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				},
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			await openDroxChatPanel(accessor);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		command: {
			id: DroxCommands.OpenChat,
			title: localize({ key: 'miOpenDrox', comment: ['&& denotes a mnemonic'] }, '&&Drox'),
		},
		group: '4_auxbar',
		order: 1,
	});

	registerAction2(class NewDroxChatAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.NewChat,
				title: localize2('drox.newChat', 'New Drox Chat'),
				category: DROX_CATEGORY,
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib + 50,
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
				},
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const bridge = accessor.get(IDroxComposerBridgeService);
			await openDroxChatPanel(accessor);
			bridge.requestNewChat();
		}
	});

	registerAction2(class OpenDroxSettingsAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.OpenSettings,
				title: localize2('drox.openSettings', 'Open Drox Settings'),
				shortTitle: localize('drox.openSettings.short', 'Drox Settings'),
				icon: Codicon.settingsGear,
				category: DROX_CATEGORY,
				f1: true,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', DroxViews.ChatViewId),
					order: 20,
					group: 'navigation',
				}],
			});
		}

		override run(accessor: ServicesAccessor): void {
			const preferencesService = accessor.get(IPreferencesService);
			void preferencesService.openSettings({ jsonEditor: false, query: DROX_SETTINGS_SEARCH_QUERY });
		}
	});

	registerAction2(class DroxAddReferencesAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.AddReferences,
				title: localize2('drox.addReferences', 'Add Drox References (Files/Folders)'),
				category: DROX_CATEGORY,
				f1: true,
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const viewsService = accessor.get(IViewsService);
			const workspaceContext = accessor.get(IWorkspaceContextService);
			const fileDialogService = accessor.get(IFileDialogService);
			const refsBridge = accessor.get(IDroxRefsBridgeService);
			const notificationService = accessor.get(INotificationService);

			await viewsService.openView(DroxViews.ChatViewId, true);

			const folders = workspaceContext.getWorkspace().folders;
			const defaultUri = folders[0]?.uri;

			const picked = await fileDialogService.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: true,
				canSelectMany: true,
				defaultUri,
				title: localize('drox.addReferences.dialogTitle', 'Drox — references (files or folders)'),
			});
			if (!picked?.length) {
				return;
			}
			refsBridge.postReferences(picked.map((u: URI) => u.toString()));
			notificationService.info(
				localize('drox.addReferences.added', 'Added {0} reference(s) to the Drox composer.', picked.length),
			);
		}
	});

	registerAction2(class DroxRevertLastRunAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.RevertLastRun,
				title: localize2('drox.revertLastRun', 'Drox: Undo Last Agent Run'),
				category: DROX_CATEGORY,
				f1: true,
				icon: Codicon.discard,
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const runRevertService = accessor.get(IDroxRunRevertService);
			const notificationService = accessor.get(INotificationService);
			await openDroxChatPanel(accessor);
			if (!runRevertService.hasRevertable()) {
				notificationService.info(localize('drox.revert.none', 'No run to revert.'));
				return;
			}
			const res = await runRevertService.revertLastRun();
			if (res.revertedPaths.length > 0) {
				notificationService.info(
					localize(
						'drox.revert.done',
						'Reverted last run ({0} file(s)).',
						res.revertedPaths.length,
					),
				);
			}
			if (res.errors.length > 0) {
				notificationService.warn(localize('drox.revert.partial', 'Some files could not be reverted.'));
			}
		}
	});
}
