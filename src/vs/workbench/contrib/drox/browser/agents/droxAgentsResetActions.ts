/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { isDroxAgentsWindowEnabled } from '../../common/droxAgentsConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { clearDroxEngineSessionRecency } from '../../common/droxSharedChatSessionHistory.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../common/droxAgentsSession.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';

export function registerDroxAgentsResetActions(): void {
	registerAction2(class DroxAgentsResetWorkspaceAction extends Action2 {
		constructor() {
			super({
				id: 'drox.agents.resetWorkspace',
				title: localize2('drox.agents.resetWorkspace', 'Reset Drox Data for This Workspace'),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.equals('config.drox.agentsWindow.enabled', true),
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const configurationService = accessor.get(IConfigurationService);
			const chatSessionService = accessor.get(IDroxChatSessionService);
			const notificationService = accessor.get(INotificationService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const dialogService = accessor.get(IDialogService);
			const sessionService = accessor.get(IDroxSessionService);
			const storageService = accessor.get(IStorageService);
			const runRevertService = accessor.get(IDroxRunRevertService);
			const sessionsService = accessor.get(ISessionsService);

			if (!isDroxAgentsWindowEnabled(configurationService)) {
				return;
			}

			if (chatSessionService.getRunId()) {
				notificationService.warn(localize(
					'drox.agents.reset.busy',
					'Stop the current run before resetting workspace Drox data.',
				));
				return;
			}

			const workspaceFolder = workspaceContextService.getWorkspace().folders[0];
			const workspacePath = workspaceFolder?.uri.fsPath;
			if (!workspacePath || !workspaceFolder) {
				notificationService.warn(localize('drox.agents.reset.noWorkspace', 'No workspace folder is open.'));
				return;
			}

			const { confirmed } = await dialogService.confirm({
				type: 'warning',
				message: localize('drox.agents.reset.title', 'Reset Drox data for this workspace?'),
				detail: localize(
					'drox.agents.reset.detail',
					'Permanently deletes:\n• all of `.drox/` (sessions, memory, attachments, …)\n• `MEMORY.md` at the workspace root\n\nKept: `.drox/.env` only.',
				),
				primaryButton: localize({ key: 'drox.agents.reset.confirm', comment: ['&& denotes a mnemonic'] }, '&&Reset'),
				cancelButton: localize('drox.agents.reset.cancel', 'Cancel'),
			});
			if (!confirmed) {
				return;
			}

			try {
				await sessionService.resetWorkspace(workspacePath);
				clearDroxEngineSessionRecency(storageService, workspacePath);
				runRevertService.resetWorkspaceUiState();
				await getDroxSessionsProviderInstance()?.purgeWorkspaceSessions(workspaceFolder.uri);
				sessionsService.openNewSession({
					folderUri: workspaceFolder.uri,
					providerId: DROX_SESSIONS_PROVIDER_ID,
				});
				notificationService.info(localize(
					'drox.agents.reset.done',
					'Workspace Drox data reset. Start a new chat session to continue.',
				));
			} catch (e) {
				notificationService.error(localize(
					'drox.agents.reset.failed',
					'Failed to reset workspace Drox data: {0}',
					e instanceof Error ? e.message : String(e),
				));
			}
		}
	});
}
