/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { IDroxChatWebviewRouterHost } from './droxChatWebviewRouter.js';

export async function handleDroxRevertLastRun(
	host: IDroxChatWebviewRouterHost,
	deps: {
		readonly runRevertService: IDroxRunRevertService;
		readonly notificationService: INotificationService;
	},
): Promise<void> {
	if (!deps.runRevertService.hasRevertable()) {
		host.post({
			kind: 'append',
			role: 'system',
			text: localize('drox.revert.none', 'No run to revert.'),
		});
		return;
	}
	const res = await deps.runRevertService.revertLastRun();
	host.syncRunRevertState();
	if (res.revertedPaths.length > 0) {
		host.post({
			kind: 'append',
			role: 'system',
			text: localize(
				'drox.revert.done',
				'Reverted last run ({0} file(s)).',
				res.revertedPaths.length,
			),
		});
	}
	if (res.errors.length > 0) {
		host.post({
			kind: 'append',
			role: 'error',
			text: res.errors.join('\n'),
		});
		deps.notificationService.warn(localize('drox.revert.partial', 'Some files could not be reverted.'));
	}
}

export async function handleDroxRevertToMessage(
	host: IDroxChatWebviewRouterHost,
	deps: {
		readonly runRevertService: IDroxRunRevertService;
		readonly notificationService: INotificationService;
	},
	messageId: string,
): Promise<void> {
	const ws = host.workspaceRoot();
	if (!ws) {
		host.post({
			kind: 'append',
			role: 'error',
			text: localize('drox.revert.workspaceMissing', 'No workspace available for restore.'),
		});
		return;
	}
	const res = await deps.runRevertService.revertToMessage(ws, messageId);
	host.syncRunRevertState();
	if (res.revertedPaths.length > 0) {
		host.post({
			kind: 'append',
			role: 'system',
			text: localize(
				'drox.revert.toMessage.done',
				'Workspace restored to selected message ({0} file(s)).',
				res.revertedPaths.length,
			),
		});
	}
	if (res.errors.length > 0) {
		host.post({
			kind: 'append',
			role: 'error',
			text: res.errors.join('\n'),
		});
		deps.notificationService.warn(localize('drox.revert.toMessage.partial', 'Restore reported one or more errors.'));
	}
}
