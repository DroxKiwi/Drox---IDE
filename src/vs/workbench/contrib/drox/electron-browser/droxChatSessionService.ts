/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxChatSessionService } from '../common/droxChatSessionService.js';



export class DroxChatSessionService implements IDroxChatSessionService {



	declare readonly _serviceBrand: undefined;



	private _sessionId: string | undefined;

	private _runId: string | undefined;

	private _pendingSessionReset = false;



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

		this._runId = id;

	}

	getPendingSessionReset(): boolean {

		return this._pendingSessionReset;

	}

	setPendingSessionReset(value: boolean): void {

		this._pendingSessionReset = value;

	}

}

