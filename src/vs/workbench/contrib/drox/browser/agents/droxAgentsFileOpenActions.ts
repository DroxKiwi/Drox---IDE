/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
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
import { resolveDroxBeforeSnapshotUri } from '../../common/droxFileChangeProgress.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../../files/browser/fileConstants.js';

const DROX_CATEGORY = localize2('drox.category', 'Drox');

/**
 * Résout le workspace de la session Drox **sans** `ISessionsService`.
 * Dans la fenêtre IDE, `ISessionsService` tire `sessionsPartService` qui n'est
 * pas enregistré → le clic chemin plantait silencieusement.
 */
function resolveWorkspaceFsPath(
	droxChatSessionService: IDroxChatSessionService,
	workspaceContextService: IWorkspaceContextService,
): string | undefined {
	const engineId = droxChatSessionService.getSessionId();
	if (engineId) {
		const sessionResource = DroxChatSessionUri.forSession(engineId);
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
	commandService: ICommandService,
	fileService: IFileService,
	absPath: string,
	toolId?: string,
	workspaceRoot?: string,
): Promise<void> {
	const safePath = sanitizePathForEditor(absPath);
	if (!safePath) {
		notificationService.warn(localize('drox.openSessionFileInvalid', 'Drox: invalid path — {0}', absPath));
		logService.warn(`[Drox] openSessionFile ignored (invalid path): ${absPath.slice(0, 120)}`);
		return;
	}
	layoutService.setPartHidden(false, Parts.EDITOR_PART);
	const fileUri = URI.file(safePath);
	const beforeCandidate = resolveDroxBeforeSnapshotUri(workspaceRoot, toolId);
	const beforeUri = beforeCandidate && await fileService.exists(beforeCandidate) ? beforeCandidate : undefined;
	try {
		const opened = beforeUri
			? await editorService.openEditor({
				original: { resource: beforeUri },
				modified: { resource: fileUri },
				options: { pinned: true, revealIfOpened: true },
			}, ACTIVE_GROUP)
			: await editorService.openEditor({
				resource: fileUri,
				options: { pinned: true, revealIfOpened: true },
			}, ACTIVE_GROUP);
		if (!opened) {
			notificationService.warn(localize('drox.openSessionFileFailed', 'Drox: could not open {0}', absPath));
			logService.warn(`[Drox] openSessionFile openEditor returned empty for ${absPath}`);
			return;
		}
		void commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, fileUri);
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
				accessor.get(ILogService).warn('[Drox] openSessionFile ignored (empty path)');
				return;
			}

			const editorService = accessor.get(IEditorService);
			const layoutService = accessor.get(IWorkbenchLayoutService);
			const notificationService = accessor.get(INotificationService);
			const logService = accessor.get(ILogService);
			const commandService = accessor.get(ICommandService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const fileService = accessor.get(IFileService);
			const droxChatSessionService = accessor.get(IDroxChatSessionService);

			const workspacePath = resolveWorkspaceFsPath(droxChatSessionService, workspaceContextService);
			const absPath = resolveWorkspaceFilePath(workspacePath, path) || path;
			const tid = typeof toolId === 'string' && toolId ? toolId : undefined;

			logService.info(`[Drox] openSessionFile path=${path} abs=${absPath} toolId=${tid ?? ''}`);

			const safePath = sanitizePathForEditor(absPath);
			if (!safePath) {
				notificationService.warn(localize('drox.openSessionFileInvalid', 'Drox: invalid path — {0}', absPath));
				logService.warn(`[Drox] openSessionFile invalid path: ${absPath.slice(0, 120)}`);
				return;
			}

			if (!(await fileService.exists(URI.file(safePath)))) {
				notificationService.warn(localize('drox.openSessionFileMissing', 'Drox: file not found — {0}', absPath));
				logService.warn(`[Drox] openSessionFile missing on disk: ${absPath}`);
			}

			await openAbsoluteFileInEditor(
				editorService,
				layoutService,
				notificationService,
				logService,
				commandService,
				fileService,
				absPath,
				tid,
				workspacePath,
			);
		}
	});
}
