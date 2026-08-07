/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { localize2 } from '../../../../../nls.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { writeDroxIdeSessionHandoff } from '../../common/droxIdeSessionHandoff.js';

/** Invoked from Agents `Open in Editor` (sessions layer cannot import workbench/contrib/drox). */
export const DROX_PREPARE_IDE_SESSION_HANDOFF_COMMAND_ID = 'drox.prepareIdeSessionHandoff';

function resolveEngineSessionId(
	droxChatSessionService: IDroxChatSessionService,
	sessionsService: ISessionsService,
): string | undefined {
	const fromService = droxChatSessionService.getSessionId();
	if (fromService) {
		return fromService;
	}
	const active = sessionsService.activeSession.get();
	if (!active) {
		return undefined;
	}
	const activeChat = active.activeChat.get();
	return (activeChat ? DroxChatSessionUri.parseSessionId(activeChat.resource) : undefined)
		?? DroxChatSessionUri.parseSessionId(active.resource);
}

export function registerDroxIdeSessionHandoffActions(): void {
	registerAction2(class DroxPrepareIdeSessionHandoffAction extends Action2 {
		constructor() {
			super({
				id: DROX_PREPARE_IDE_SESSION_HANDOFF_COMMAND_ID,
				title: localize2('drox.prepareIdeSessionHandoff', 'Drox: Prepare IDE Session Handoff'),
				f1: false,
			});
		}

		override async run(accessor: ServicesAccessor, workspaceFsPath?: string): Promise<boolean> {
			const path = typeof workspaceFsPath === 'string' ? workspaceFsPath.trim() : '';
			if (!path) {
				return false;
			}
			const storageService = accessor.get(IStorageService);
			const engineSessionId = resolveEngineSessionId(
				accessor.get(IDroxChatSessionService),
				accessor.get(ISessionsService),
			);
			if (!engineSessionId) {
				return false;
			}
			const wrote = writeDroxIdeSessionHandoff(storageService, path, engineSessionId);
			if (wrote) {
				await storageService.flush();
			}
			return wrote;
		}
	});
}
