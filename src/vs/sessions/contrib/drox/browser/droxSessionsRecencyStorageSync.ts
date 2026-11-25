/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import {
	DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
	DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,
} from '../../../../workbench/contrib/drox/common/droxSharedChatSessionHistory.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/** Recharge le MRU Agents quand l’IDE ou la webview met à jour le stockage partagé. */
class DroxSessionsRecencyStorageSync extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.droxRecencyStorageSync';

	constructor(
		@IStorageService storageService: IStorageService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super();
		const store = this._register(new DisposableStore());
		const reload = () => this.sessionsService.reloadRecencyFromStorage();
		this._register(storageService.onDidChangeValue(StorageScope.WORKSPACE, DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, store)(reload));
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, store)(reload));
	}
}

registerWorkbenchContribution2(
	DroxSessionsRecencyStorageSync.ID,
	DroxSessionsRecencyStorageSync,
	WorkbenchPhase.AfterRestored,
);
