/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { handleDroxEngineNotification } from '../../browser/chat/droxChatAgentHost.js';
import { DroxHostToWebviewMessage } from '../../browser/droxChatBridge.js';

suite('DroxChatAgentHost', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('agent/done finalizes run when webview is not ready', () => {
		const posts: DroxHostToWebviewMessage[] = [];
		let currentRunId: string | undefined = 'run_test';
		let reconcileCalls = 0;
		const host = {
			post: (m: DroxHostToWebviewMessage) => posts.push(m),
			syncChatSessionState: () => { /* noop */ },
			syncRunRevertState: () => { /* noop */ },
			resolveUserAskSkipped: () => { /* noop */ },
			clearActivePermissionMode: () => { /* noop */ },
			getCurrentRunId: () => currentRunId,
			clearCurrentRunId: () => { currentRunId = undefined; },
			getSuppressedRunId: () => undefined,
			clearSuppressedRunId: () => { /* noop */ },
			getPendingTool: () => undefined,
			setPendingTool: () => { /* noop */ },
			deletePendingTool: () => { /* noop */ },
			takePendingToolForFileFinish: () => undefined,
			clearPendingTools: () => { /* noop */ },
			workspaceUri: () => undefined,
			workspaceRoot: () => undefined,
			openModifiedFile: async () => { /* noop */ },
			reconcileChatBusyState: () => { reconcileCalls++; },
		};
		const tabs = {
			currentSessionId: 'ses_test',
			setTabTitleFromModel: () => { /* noop */ },
			trackUsageForActiveTab: () => { /* noop */ },
			trackContextForActiveTab: () => { /* noop */ },
			getActiveTab: () => undefined,
			resetActiveTabConversation: () => { /* noop */ },
		};
		const agentDeps = {
			chatSessionService: { getPendingSessionReset: () => false, setPendingSessionReset: () => { /* noop */ } },
			longMemoryService: { ingestContextChunkSummary: async () => { /* noop */ } },
			configurationService: { getValue: () => undefined },
			outputService: { showChannel: () => { /* noop */ } },
			editorService: {},
			notificationService: { notify: () => ({ close: () => { /* noop */ } }) },
			logService: { info: () => { /* noop */ }, warn: () => { /* noop */ }, error: () => { /* noop */ } },
			runSettingsService: { getLlmSettings: () => ({ model: 'test' }) },
			runRevertService: { finalizeRun: () => { /* noop */ } },
			hostService: { hasFocus: () => true, onDidChangeFocus: () => ({ dispose: () => { /* noop */ } }) },
		};

		handleDroxEngineNotification(
			false,
			host as never,
			tabs as never,
			agentDeps as never,
			{ windowId: 1, method: 'agent/done', params: { runId: 'run_test', status: 'completed' } },
		);

		assert.strictEqual(currentRunId, undefined);
		assert.ok(posts.some(p => p.kind === 'state' && p.busy === false));
		assert.strictEqual(reconcileCalls, 1);
	});
});
