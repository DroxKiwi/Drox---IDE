/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { autorun } from '../../../../base/common/observable.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IDroxCodebaseSupervisionService } from '../../../../workbench/contrib/drox/common/codebase/droxCodebaseSupervisionService.js';
import { DroxChatSessionUri, DROX_SESSIONS_PROVIDER_ID } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { IDroxRunSettingsService } from '../../../../workbench/contrib/drox/common/droxRunSettingsService.js';
import { IDroxRegulationService } from '../../../../workbench/contrib/drox/common/regulation/droxRegulationServiceContract.js';
import { markDroxEngineSessionOpened } from '../../../../workbench/contrib/drox/common/droxSharedChatSessionHistory.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/** Persiste la session Drox active (fenêtre Agents) pour reprise dans l’IDE Native. */
class DroxSessionsActiveSessionSync extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.droxActiveSessionSync';

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IDroxCodebaseSupervisionService private readonly codebaseSupervision: IDroxCodebaseSupervisionService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxRegulationService private readonly regulationService: IDroxRegulationService,
	) {
		super();
		this._register(autorun(reader => {
			const active = this.sessionsService.activeSession.read(reader);
			if (!active || active.providerId !== DROX_SESSIONS_PROVIDER_ID) {
				return;
			}
			const engineSessionId = DroxChatSessionUri.parseSessionId(active.resource);
			const workspace = active.workspace.read(reader);
			const folder = workspace?.folders[0];
			const rootUri = folder?.workingDirectory ?? folder?.root;
			const workspaceFsPath = rootUri?.fsPath;
			if (rootUri) {
				this.codebaseSupervision.setActiveRoot(rootUri);
				this.runSettingsService.setActiveWorkspaceResource(rootUri);
				void this.regulationService.ensureHistoryLoaded(rootUri.fsPath).catch(() => { /* best-effort */ });
			} else {
				this.codebaseSupervision.setActiveRoot(undefined);
				this.runSettingsService.setActiveWorkspaceResource(undefined);
			}
			if (!engineSessionId || !workspaceFsPath) {
				return;
			}
			markDroxEngineSessionOpened(this.storageService, workspaceFsPath, engineSessionId);
		}));
	}
}

registerWorkbenchContribution2(
	DroxSessionsActiveSessionSync.ID,
	DroxSessionsActiveSessionSync,
	WorkbenchPhase.AfterRestored,
);
