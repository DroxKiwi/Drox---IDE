/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	markDroxEngineSessionOpened,
	readLastDroxEngineSessionId,
} from '../../common/droxSharedChatSessionHistory.js';

/** Dernière session moteur active (partagée IDE Native ↔ fenêtre Agents). */
export class DroxNativeChatSessionStore {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) { }

	getActiveSessionId(): string | undefined {
		const ws = this._workspaceFsPath();
		if (!ws) {
			return undefined;
		}
		return readLastDroxEngineSessionId(this.storageService, ws);
	}

	setActiveSessionId(sessionId: string | undefined): void {
		const ws = this._workspaceFsPath();
		if (!ws || !sessionId) {
			return;
		}
		markDroxEngineSessionOpened(this.storageService, ws, sessionId);
	}

	private _workspaceFsPath(): string | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}
}
