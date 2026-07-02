/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize2 } from '../../../../../nls.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { DroxCommands } from '../../common/drox.js';
import { IDroxSessionChangesDetailService } from '../../common/droxSessionChangesDetailService.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { openDroxSessionFileChange } from './droxOpenSessionFile.js';
import { openDroxWorkspaceFile } from '../chat/droxChatFileActions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOutputService } from '../../../../services/output/common/output.js';

const DROX_CATEGORY = localize2('drox.category', 'Drox');

export function registerDroxAgentsFileOpenActions(): void {
	registerAction2(class DroxOpenSessionFileAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.OpenSessionFile,
				title: localize2('drox.openSessionFile', 'Drox: Open Session File'),
				category: DROX_CATEGORY,
				f1: false,
			});
		}

		override async run(accessor: ServicesAccessor, filePath?: string, toolId?: string): Promise<void> {
			const path = typeof filePath === 'string' ? filePath.trim() : '';
			if (!path) {
				return;
			}

			const sessionsService = accessor.get(ISessionsService);
			const activeChat = sessionsService.activeSession.get()?.activeChat.get();
			const sessionResource = activeChat?.resource;
			const workspacePath = sessionResource
				? getDroxSessionsProviderInstance()?.getSessionWorkspacePath(sessionResource)
				: undefined;

			if (!sessionResource) {
				await openDroxWorkspaceFile(
					{ post: () => { }, workspaceRoot: () => workspacePath, workspaceUri: () => workspacePath ? URI.file(workspacePath) : undefined },
					accessor.get(IEditorService),
					accessor.get(INotificationService),
					accessor.get(IOutputService),
					accessor.get(ILogService),
					path,
				);
				return;
			}

			await openDroxSessionFileChange({
				editorService: accessor.get(IEditorService),
				layoutService: accessor.get(IWorkbenchLayoutService),
				labelService: accessor.get(ILabelService),
				detailService: accessor.get(IDroxSessionChangesDetailService),
				fileService: accessor.get(IFileService),
				contextKeyService: accessor.get(IContextKeyService),
			}, sessionResource, path, workspacePath, typeof toolId === 'string' && toolId ? toolId : undefined);
		}
	});
}
