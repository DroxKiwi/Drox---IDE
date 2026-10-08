/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ISession } from '../../../../../sessions/services/sessions/common/session.js';
import {
	IDroxSessionBackgroundService,
	IDroxSessionDashboardSignals,
	IDroxSessionResourceMetricsView,
} from '../../../../../sessions/contrib/drox/common/droxSessionBackgroundService.js';

const EMPTY_SET = new Set<string>();
const EMPTY_METRICS: IDroxSessionResourceMetricsView = {
	cpuPercent: 0,
	ramPercent: 0,
	diskPercent: 0,
	downloadPercent: 0,
	uploadPercent: 0,
	cpuHistory: [],
	ramHistory: [],
	diskHistory: [],
	downloadHistory: [],
	uploadHistory: [],
};
const EMPTY_DASHBOARD: IDroxSessionDashboardSignals = {
	shellActive: false,
	modelActive: false,
	gitOperationActive: false,
	needsInput: false,
	backgroundPersistent: false,
	allowOutsideWorkspace: false,
	allowOutsideWorkspaceRead: false,
	allowOutsideWorkspaceWrite: false,
};

/**
 * IDE workbench stub for {@link IDroxSessionBackgroundService}.
 *
 * The real implementation lives in `sessions.desktop` (Agents window). Without a
 * registered service, `DroxAgentsChatContribution` fails to construct
 * `DroxAgentsSessionHandler` and the drox content provider never registers —
 * which is exactly the "content provider not ready" / chat timeout path.
 */
export class DroxIdeSessionBackgroundService extends Disposable implements IDroxSessionBackgroundService {

	declare readonly _serviceBrand: undefined;

	readonly persistentSessionIds: IObservable<ReadonlySet<string>> = constObservable(EMPTY_SET);

	private readonly _allowOutsideRead = observableValue<ReadonlySet<string>>('droxIdeAllowOutsideRead', EMPTY_SET);
	readonly allowOutsideWorkspaceReadSessionIds: IObservable<ReadonlySet<string>> = this._allowOutsideRead;

	private readonly _allowOutsideWrite = observableValue<ReadonlySet<string>>('droxIdeAllowOutsideWrite', EMPTY_SET);
	readonly allowOutsideWorkspaceWriteSessionIds: IObservable<ReadonlySet<string>> = this._allowOutsideWrite;

	readonly allowOutsideWorkspaceSessionIds: IObservable<ReadonlySet<string>> = derived(reader => {
		const next = new Set(this._allowOutsideRead.read(reader));
		for (const id of this._allowOutsideWrite.read(reader)) {
			next.add(id);
		}
		return next;
	});

	isPersistent(_sessionId: string): boolean {
		return false;
	}

	setPersistent(_sessionId: string, _value: boolean): void {
		// no-op in IDE
	}

	isAllowOutsideWorkspace(sessionId: string): boolean {
		return this.isAllowOutsideWorkspaceRead(sessionId) || this.isAllowOutsideWorkspaceWrite(sessionId);
	}

	setAllowOutsideWorkspace(sessionId: string, value: boolean): void {
		this.setAllowOutsideWorkspaceRead(sessionId, value);
		this.setAllowOutsideWorkspaceWrite(sessionId, value);
	}

	isAllowOutsideWorkspaceRead(sessionId: string): boolean {
		return this._allowOutsideRead.get().has(sessionId);
	}

	setAllowOutsideWorkspaceRead(sessionId: string, value: boolean): void {
		const next = new Set(this._allowOutsideRead.get());
		if (value) {
			next.add(sessionId);
		} else {
			next.delete(sessionId);
		}
		this._allowOutsideRead.set(next, undefined);
	}

	isAllowOutsideWorkspaceWrite(sessionId: string): boolean {
		return this._allowOutsideWrite.get().has(sessionId);
	}

	setAllowOutsideWorkspaceWrite(sessionId: string, value: boolean): void {
		const next = new Set(this._allowOutsideWrite.get());
		if (value) {
			next.add(sessionId);
		} else {
			next.delete(sessionId);
		}
		this._allowOutsideWrite.set(next, undefined);
	}

	hasLayoutSnapshot(_sessionId: string): boolean {
		return false;
	}

	getTerminalForegroundPolicy(_sessionId: string | undefined): 'default' | 'suppressEnsure' {
		return 'default';
	}

	async suspendForegroundSession(_session: ISession, _options: { readonly kill: boolean }): Promise<void> {
		// no-op in IDE
	}

	async applyForegroundLayout(_session: ISession): Promise<void> {
		// no-op in IDE
	}

	getDashboardSignals(_sessionId: string): IObservable<IDroxSessionDashboardSignals> {
		return constObservable(EMPTY_DASHBOARD);
	}

	getResourceMetrics(_sessionId: string): IObservable<IDroxSessionResourceMetricsView> {
		return constObservable(EMPTY_METRICS);
	}
}

registerSingleton(IDroxSessionBackgroundService, DroxIdeSessionBackgroundService, InstantiationType.Delayed);
