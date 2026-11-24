/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IDroxEngineService } from '../../../../workbench/contrib/drox/common/droxEngineService.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IDroxSessionBackgroundService } from '../common/droxSessionBackgroundService.js';

/**
 * When the Drox engine finishes starting, reapply the active session layout
 * once, then paint. Late session arrivals are laid out by the workbench
 * restore pass, which only calls {@link IAgentWorkbenchLayoutService.layout}.
 */
class DroxSessionsColdStartLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'drox.sessionsColdStartLayout';

	constructor(
		@IDroxSessionBackgroundService private readonly _backgroundService: IDroxSessionBackgroundService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentWorkbenchLayoutService private readonly _workbenchLayoutService: IAgentWorkbenchLayoutService,
		@IDroxEngineService private readonly _droxEngineService: IDroxEngineService,
	) {
		super();

		this._register(this._droxEngineService.onDidInitialize(() => {
			void this._reconcileForegroundLayout();
		}));
	}

	private async _reconcileForegroundLayout(): Promise<void> {
		const active = this._sessionsService.activePane.get()?.session.get();
		if (!active || active.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			this._paintAfterColdStart();
			return;
		}

		const session = this._sessionsManagementService.getSession(active.resource);
		if (!session) {
			this._paintAfterColdStart();
			return;
		}

		await this._backgroundService.applyForegroundLayout(session);
		this._paintAfterColdStart();
	}

	private _paintAfterColdStart(): void {
		this._workbenchLayoutService.layout();
		for (const delay of [0, 100, 400]) {
			this._register(disposableTimeout(() => {
				this._workbenchLayoutService.layout();
			}, delay));
		}
	}
}

registerWorkbenchContribution2(
	DroxSessionsColdStartLayoutContribution.ID,
	DroxSessionsColdStartLayoutContribution,
	WorkbenchPhase.AfterRestored,
);
