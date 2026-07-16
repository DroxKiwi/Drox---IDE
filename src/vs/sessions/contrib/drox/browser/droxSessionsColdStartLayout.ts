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
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IDroxSessionBackgroundService } from '../common/droxSessionBackgroundService.js';

/**
 * After cold boot the Drox engine and persisted sessions can surface after the
 * initial {@link ISessionsService.restoreVisibleSessions} pass. Trigger a layout
 * pass so the grid paints; foreground template is applied at most once per
 * session entry via {@link IDroxSessionBackgroundService.applyForegroundLayout}.
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
		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			if (e.added.length > 0) {
				// Late-loaded sessions need a relayout only — never re-apply the
				// default template or open editors get closed immediately.
				this._scheduleLateSessionLayout();
			}
		}));
	}

	private _lateSessionLayoutScheduled = false;

	private _scheduleLateSessionLayout(): void {
		if (this._lateSessionLayoutScheduled) {
			return;
		}
		this._lateSessionLayoutScheduled = true;
		// Timers fire without user input; rAF may not after cold boot on Windows.
		this._register(disposableTimeout(() => {
			this._lateSessionLayoutScheduled = false;
			this._workbenchLayoutService.layout();
		}, 0));
		this._register(disposableTimeout(() => {
			this._workbenchLayoutService.layout();
		}, 200));
	}

	private async _reconcileForegroundLayout(): Promise<void> {
		const active = this._sessionsService.activeSession.get();
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
