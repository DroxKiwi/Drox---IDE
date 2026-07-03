/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../chat/common/chatSessionsService.js';
import { DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import {
	droxAgentsChatSessionHasLiveRun,
	evictDroxAgentsChatSessionForReload,
	shouldEvictDroxAgentsChatSessionForReload,
} from '../../browser/agents/droxAgentsChatSessionCache.js';

function mockModel(opts?: {
	requestInProgress?: boolean;
	hasActiveRequest?: boolean;
	incompleteResponse?: boolean;
}): IChatModel {
	const requestInProgress = observableValue('requestInProgress', opts?.requestInProgress ?? false);
	const hasActiveRequest = observableValue('hasActiveRequest', opts?.hasActiveRequest ?? false);
	const requestNeedsInput = observableValue<undefined>('requestNeedsInput', undefined);
	const requests = opts?.incompleteResponse
		? [{ response: { isComplete: false } }]
		: [];
	return {
		requestInProgress,
		hasActiveRequest,
		requestNeedsInput,
		getRequests: () => requests,
	} as unknown as IChatModel;
}

suite('droxAgentsChatSessionCache', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = DroxChatSessionUri.forSession('test-session');

	test('hasLiveRun — observables', () => {
		const idle = mockModel();
		assert.strictEqual(droxAgentsChatSessionHasLiveRun(idle), false);
		assert.strictEqual(droxAgentsChatSessionHasLiveRun(mockModel({ requestInProgress: true })), true);
	});

	test('hasLiveRun — incomplete last response', () => {
		assert.strictEqual(droxAgentsChatSessionHasLiveRun(mockModel({ incompleteResponse: true })), true);
	});

	test('shouldEvict skips live Drox session', () => {
		const chatService = {
			getSession: (uri: URI) => uri.toString() === sessionResource.toString()
				? mockModel({ requestInProgress: true })
				: undefined,
		} as unknown as IChatService;
		assert.strictEqual(shouldEvictDroxAgentsChatSessionForReload(sessionResource, chatService), false);
	});

	test('evict does not touch cache while live', () => {
		let evictCount = 0;
		const chatSessionsService = {
			evictCachedChatSession: () => { evictCount++; },
		} as unknown as IChatSessionsService;
		const chatService = {
			getSession: () => mockModel({ hasActiveRequest: true }),
			acquireExistingSession: () => undefined,
		} as unknown as IChatService;

		evictDroxAgentsChatSessionForReload(sessionResource, chatSessionsService, chatService);
		assert.strictEqual(evictCount, 0);
	});

	test('evict clears cache when idle', () => {
		let evictCount = 0;
		const chatSessionsService = {
			evictCachedChatSession: () => { evictCount++; },
		} as unknown as IChatSessionsService;
		const chatService = {
			getSession: () => mockModel(),
			acquireExistingSession: () => undefined,
		} as unknown as IChatService;

		evictDroxAgentsChatSessionForReload(sessionResource, chatSessionsService, chatService);
		assert.strictEqual(evictCount, 1);
	});
});
