/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';
import { getChatSessionType } from '../../../chat/common/model/chatUri.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../chat/common/chatSessionsService.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';

/**
 * Drops contributed-session and in-memory chat model caches so the next
 * `acquireOrLoadSession` re-reads disk via `DroxAgentsSessionHandler`.
 */
export function evictDroxAgentsChatSessionForReload(
	sessionResource: URI,
	chatSessionsService: IChatSessionsService,
	chatService: IChatService,
): void {
	if (getChatSessionType(sessionResource) !== DROX_CHAT_SESSION_TYPE) {
		return;
	}
	chatSessionsService.evictCachedChatSession(sessionResource);
	const existingRef = chatService.acquireExistingSession(sessionResource, 'DroxAgents#evictForReload');
	if (existingRef) {
		// Never tear down a live run — autorun/session sync can fire during streaming.
		if (!existingRef.object.requestInProgress.get()) {
			existingRef.dispose();
		}
	}
}
