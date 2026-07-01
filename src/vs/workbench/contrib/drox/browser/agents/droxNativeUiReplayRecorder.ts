/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';

/** Persiste les événements fil natif dans `.ui-replay.jsonl` (même format que la webview). */
export class DroxNativeUiReplayRecorder {

	constructor(
		private readonly sessionService: IDroxSessionService,
		private readonly sessionId: string,
		private readonly workspaceFsPath: string,
	) { }

	record(message: DroxHostToWebviewMessage): void {
		void this.sessionService.appendUiReplayMessage(this.sessionId, this.workspaceFsPath, message);
	}
}
