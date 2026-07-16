/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';
import { getChatSessionType } from '../../../chat/common/model/chatUri.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../chat/common/chatSessionsService.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';

/** True when the chat model still has an agent turn in flight (stream or tool wait). */
export function droxAgentsChatSessionHasLiveRun(model: IChatModel): boolean {
	if (model.requestInProgress.get() || model.hasActiveRequest.get()) {
		return true;
	}
	const lastRequest = model.getRequests().at(-1);
	return !!lastRequest?.response && !lastRequest.response.isComplete;
}

function isDroxAgentsSessionResource(sessionResource: URI): boolean {
	return getChatSessionType(sessionResource) === DROX_CHAT_SESSION_TYPE;
}

/**
 * Whether {@link evictDroxAgentsChatSessionForReload} should run for this resource.
 * Skips eviction while a live in-memory run is active so background streaming survives tab switches.
 */
export function shouldEvictDroxAgentsChatSessionForReload(
	sessionResource: URI,
	chatService: IChatService,
): boolean {
	if (!isDroxAgentsSessionResource(sessionResource)) {
		return false;
	}
	const model = chatService.getSession(sessionResource);
	if (model && droxAgentsChatSessionHasLiveRun(model)) {
		return false;
	}
	return true;
}

/**
 * Drops contributed-session and in-memory chat model caches so the next
 * `acquireOrLoadSession` re-reads disk via `DroxAgentsSessionHandler`.
 *
 * No-op while a live agent run is in progress on the target session.
 */
export function evictDroxAgentsChatSessionForReload(
	sessionResource: URI,
	chatSessionsService: IChatSessionsService,
	chatService: IChatService,
): void {
	if (!shouldEvictDroxAgentsChatSessionForReload(sessionResource, chatService)) {
		return;
	}
	chatSessionsService.evictCachedChatSession(sessionResource);
	const existingRef = chatService.acquireExistingSession(sessionResource, 'DroxAgents#evictForReload');
	existingRef?.dispose();
}
