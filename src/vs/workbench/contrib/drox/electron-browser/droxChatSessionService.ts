/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';

export class DroxChatSessionService extends Disposable implements IDroxChatSessionService {

	declare readonly _serviceBrand: undefined;

	private _sessionId: string | undefined;
	private _runId: string | undefined;
	private _pendingSessionReset = false;
	private readonly _runsBySession = new Map<string, Set<string>>();

	private readonly _onDidChangeRunId = this._register(new Emitter<string | undefined>());
	readonly onDidChangeRunId = this._onDidChangeRunId.event;

	private readonly _onDidChangeRunningSessions = this._register(new Emitter<void>());
	readonly onDidChangeRunningSessions = this._onDidChangeRunningSessions.event;

	getSessionId(): string | undefined {
		return this._sessionId;
	}

	getRunId(): string | undefined {
		return this._runId;
	}

	setSessionId(id: string | undefined): void {
		this._sessionId = id;
	}

	setRunId(id: string | undefined): void {
		if (this._runId === id) {
			return;
		}
		this._runId = id;
		this._onDidChangeRunId.fire(id);
	}

	getPendingSessionReset(): boolean {
		return this._pendingSessionReset;
	}

	setPendingSessionReset(value: boolean): void {
		this._pendingSessionReset = value;
	}

	beginSessionRun(sessionId: string, runId: string): void {
		const id = sessionId.trim();
		const run = runId.trim();
		if (!id || !run) {
			return;
		}
		let runs = this._runsBySession.get(id);
		if (!runs) {
			runs = new Set();
			this._runsBySession.set(id, runs);
		}
		if (runs.has(run)) {
			return;
		}
		runs.add(run);
		this._onDidChangeRunningSessions.fire();
	}

	endSessionRun(sessionId: string, runId: string): void {
		const runs = this._runsBySession.get(sessionId);
		if (!runs?.delete(runId)) {
			return;
		}
		if (runs.size === 0) {
			this._runsBySession.delete(sessionId);
		}
		this._onDidChangeRunningSessions.fire();
	}

	isSessionRunActive(sessionId: string | undefined): boolean {
		return !!sessionId && (this._runsBySession.get(sessionId)?.size ?? 0) > 0;
	}

	hasActiveRun(): boolean {
		return this._runId !== undefined || this._runsBySession.size > 0;
	}

}
