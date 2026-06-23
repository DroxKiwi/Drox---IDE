/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { normalizeWindowsFsPath } from '../../common/droxPathUtil.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxChatFileActionsHost } from './droxChatFileActions.js';

export async function handleDroxUndoFileChange(
	host: IDroxChatFileActionsHost,
	deps: {
		readonly runRevertService: IDroxRunRevertService;
		readonly notificationService: INotificationService;
		readonly logService: ILogService;
	},
	toolId: string,
): Promise<void> {
	const id = String(toolId || '').trim();
	if (!id) {
		return;
	}
	const res = await deps.runRevertService.undoFileChange(id);
	if (res.errors.length > 0) {
		deps.notificationService.warn(
			localize('drox.fileChange.undoFailed', 'Could not undo this file change.'),
		);
		deps.logService.warn(`[Drox] undoFileChange ${id}: ${res.errors.join('; ')}`);
		return;
	}
	const msg: DroxHostToWebviewMessage = { kind: 'fileChangeState', toolId: id, undoState: 'reverted' };
	host.post(msg);
}

export async function handleDroxRedoFileChange(
	host: IDroxChatFileActionsHost,
	deps: {
		readonly runRevertService: IDroxRunRevertService;
		readonly notificationService: INotificationService;
		readonly logService: ILogService;
	},
	toolId: string,
): Promise<void> {
	const id = String(toolId || '').trim();
	if (!id) {
		return;
	}
	const res = await deps.runRevertService.redoFileChange(id);
	if (res.errors.length > 0) {
		deps.notificationService.warn(
			localize('drox.fileChange.redoFailed', 'Could not redo this file change.'),
		);
		deps.logService.warn(`[Drox] redoFileChange ${id}: ${res.errors.join('; ')}`);
		return;
	}
	const msg: DroxHostToWebviewMessage = { kind: 'fileChangeState', toolId: id, undoState: 'applied' };
	host.post(msg);
}

export async function resolveAfterContentForFileChange(
	fileService: IFileService,
	absPath: string,
	out: Record<string, unknown>,
): Promise<string> {
	if (typeof out.new_content === 'string') {
		return out.new_content;
	}
	if (typeof out.content === 'string') {
		return out.content;
	}
	try {
		const read = await fileService.readFile(URI.file(normalizeWindowsFsPath(absPath)));
		return read.value.toString();
	} catch {
		return '';
	}
}
