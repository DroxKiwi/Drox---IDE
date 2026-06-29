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

	private readonly _onDidChangeRunId = this._register(new Emitter<string | undefined>());
	readonly onDidChangeRunId = this._onDidChangeRunId.event;

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

}
