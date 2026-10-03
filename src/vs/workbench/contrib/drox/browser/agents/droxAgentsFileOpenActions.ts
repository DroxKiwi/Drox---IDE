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
import { localize, localize2 } from '../../../../../nls.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DroxCommands } from '../../common/drox.js';
import { DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { resolveWorkspaceFilePath } from '../../common/droxFileChange.js';
import { sanitizePathForEditor } from '../../common/droxPathUtil.js';
import { IDroxSessionChangesDetailService } from '../../common/droxSessionChangesDetailService.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { openDroxSessionFileChange } from './droxOpenSessionFile.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

const DROX_CATEGORY = localize2('drox.category', 'Drox');

function resolveActiveDroxSessionResource(
	droxChatSessionService: IDroxChatSessionService,
	sessionsService: ISessionsService,
): URI | undefined {
	const engineId = droxChatSessionService.getSessionId();
	if (engineId) {
		return DroxChatSessionUri.forSession(engineId);
	}
	const active = sessionsService.activeSession.get();
	if (!active) {
		return undefined;
	}
	const activeChat = active.activeChat.get();
	return activeChat?.resource ?? active.resource;
}

function resolveWorkspaceFsPath(
	sessionResource: URI | undefined,
	workspaceContextService: IWorkspaceContextService,
): string | undefined {
	if (sessionResource) {
		const fromProvider = getDroxSessionsProviderInstance()?.getSessionWorkspacePath(sessionResource);
		if (fromProvider) {
			return fromProvider;
		}
	}
	const folder = workspaceContextService.getWorkspace().folders[0];
	return folder?.uri.scheme === 'file' ? folder.uri.fsPath : undefined;
}

async function openAbsoluteFileInEditor(
	editorService: IEditorService,
	layoutService: IWorkbenchLayoutService,
	notificationService: INotificationService,
	logService: ILogService,
	absPath: string,
): Promise<void> {
	const safePath = sanitizePathForEditor(absPath);
	if (!safePath) {
		logService.warn(`[Drox] openSessionFile ignored (invalid path): ${absPath.slice(0, 120)}`);
		return;
	}
	layoutService.setPartHidden(false, Parts.EDITOR_PART);
	try {
		await editorService.openEditor({
			resource: URI.file(safePath),
			options: { pinned: true },
		}, ACTIVE_GROUP);
	} catch (e) {
		notificationService.warn(localize('drox.openSessionFileFailed', 'Drox: could not open {0}', absPath));
		logService.warn('[Drox] openSessionFile', e);
	}
}

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

			const editorService = accessor.get(IEditorService);
			const layoutService = accessor.get(IWorkbenchLayoutService);
			const notificationService = accessor.get(INotificationService);
			const logService = accessor.get(ILogService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);

			const sessionResource = resolveActiveDroxSessionResource(
				accessor.get(IDroxChatSessionService),
				accessor.get(ISessionsService),
			);
			const workspacePath = resolveWorkspaceFsPath(sessionResource, workspaceContextService);
			const absPath = resolveWorkspaceFilePath(workspacePath, path) || path;

			if (sessionResource) {
				try {
					await openDroxSessionFileChange({
						editorService,
						layoutService,
						labelService: accessor.get(ILabelService),
						detailService: accessor.get(IDroxSessionChangesDetailService),
						fileService: accessor.get(IFileService),
						contextKeyService: accessor.get(IContextKeyService),
					}, sessionResource, absPath, workspacePath, typeof toolId === 'string' && toolId ? toolId : undefined);
					return;
				} catch (e) {
					logService.warn('[Drox] openSessionFileChange failed, falling back to plain editor open', e);
				}
			}

			await openAbsoluteFileInEditor(editorService, layoutService, notificationService, logService, absPath);
		}
	});
}
