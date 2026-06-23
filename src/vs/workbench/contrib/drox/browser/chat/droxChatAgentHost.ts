/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxLongMemoryService } from '../../common/droxLongMemoryService.js';
import { IDroxEngineNotificationPayload } from '../../common/droxIpc.js';
import {
	dispatchAgentDone,
	dispatchAgentEvent,
	extractAgentNotificationRunId,
	IDroxChatAgentDoneHost,
} from '../droxChatAgentEvents.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { handleDroxFileMutationAfterToolFinish, IDroxChatFileActionsHost } from './droxChatFileActions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { localize } from '../../../../../nls.js';
import { buildDroxCycleDoneNotificationLabels, notifyDroxCycleDone } from '../../common/droxCycleDoneNotification.js';

export interface IDroxChatAgentBridgeHost extends IDroxChatFileActionsHost {
	post(message: DroxHostToWebviewMessage): void;
	syncChatSessionState(): void;
	syncRunRevertState(): void;
	resolveUserAskSkipped(): void;
	clearActivePermissionMode(): void;
	getCurrentRunId(): string | undefined;
	clearCurrentRunId(): void;
	getSuppressedRunId(): string | undefined;
	clearSuppressedRunId(): void;
	getPendingTool(id: string): { name: string; args: unknown } | undefined;
	setPendingTool(id: string, entry: { name: string; args: unknown }): void;
	deletePendingTool(id: string): void;
	takePendingToolForFileFinish(
		id: string,
		output: unknown,
	): { name: string; args: unknown } | undefined;
	clearPendingTools(): void;
	/** Resync webview `busy` depuis `_currentRunId` (focus / attach). */
	reconcileChatBusyState?(): void;
}

export function createDroxChatAgentEventHost(
	host: IDroxChatAgentBridgeHost,
	tabs: DroxChatTabsManager,
	deps: {
		readonly chatSessionService: IDroxChatSessionService;
		readonly longMemoryService: IDroxLongMemoryService;
		readonly configurationService: IConfigurationService;
		readonly outputService: IOutputService;
		readonly editorService: IEditorService;
		readonly notificationService: INotificationService;
		readonly logService: ILogService;
		readonly runSettingsService: IDroxRunSettingsService;
		readonly runRevertService: IDroxRunRevertService;
		readonly hostService: IHostService;
		readonly fileService: IFileService;
	},
): IDroxChatAgentDoneHost {
	return {
		post: (message) => host.post(message),
		getLlmModel: () => deps.runSettingsService.getLlmSettings().model,
		getCurrentSessionId: () => tabs.currentSessionId,
		setTabTitleFromModel: (sessionId, text) => tabs.setTabTitleFromModel(sessionId, text),
		trackUsageForActiveTab: (input, output) => tabs.trackUsageForActiveTab(input, output),
		trackContextForActiveTab: (tokens) => tabs.trackContextForActiveTab(tokens),
		getPendingTool: (id) => host.getPendingTool(id),
		setPendingTool: (id, entry) => host.setPendingTool(id, entry),
		deletePendingTool: (id) => host.deletePendingTool(id),
		takePendingToolForFileFinish: (id, output) => host.takePendingToolForFileFinish(id, output),
		clearPendingTools: () => host.clearPendingTools(),
		handleFileMutationAfterToolFinish: (pendingName, output, isError, toolId, pendingArgs) =>
			handleDroxFileMutationAfterToolFinish(host, deps, pendingName, output, isError, toolId, pendingArgs),
		getWorkspaceUri: () => host.workspaceUri(),
		ingestContextChunkSummary: (wsUri: URI, summary: Record<string, unknown>) => {
			void deps.longMemoryService.ingestContextChunkSummary(wsUri, summary);
		},
		getSuppressedRunId: () => host.getSuppressedRunId(),
		clearSuppressedRunId: () => host.clearSuppressedRunId(),
		resolveUserAskSkipped: () => host.resolveUserAskSkipped(),
		clearActivePermissionMode: () => host.clearActivePermissionMode(),
		clearCurrentRunId: () => host.clearCurrentRunId(),
		syncChatSessionState: () => host.syncChatSessionState(),
		finalizeRunRevert: (runId) => {
			deps.runRevertService.finalizeRun(runId);
			host.syncRunRevertState();
		},
		shouldResetConversationAfterDone: () => deps.chatSessionService.getPendingSessionReset(),
		clearPendingSessionReset: () => deps.chatSessionService.setPendingSessionReset(false),
		resetActiveTabConversation: () => tabs.resetActiveTabConversation(),
		notifyRunCycleFinished: (runId, status, error) => {
			const tabTitle = tabs.getActiveTab()?.title?.trim();
			const runLabel = tabTitle && tabTitle.length > 0
				? tabTitle
				: runId && runId.length > 0
					? runId
					: localize('drox.cycle.defaultRunName', 'Run');
			const labels = buildDroxCycleDoneNotificationLabels(runLabel, status, error);
			void notifyDroxCycleDone(deps, labels, { runLabel, status });
		},
	};
}

export function handleDroxEngineNotification(
	webviewReady: boolean,
	host: IDroxChatAgentBridgeHost,
	tabs: DroxChatTabsManager,
	agentDeps: Parameters<typeof createDroxChatAgentEventHost>[2],
	payload: IDroxEngineNotificationPayload,
): void {
	const { method, params } = payload;
	const runId = extractAgentNotificationRunId(params);
	if (runId && runId === host.getSuppressedRunId()) {
		if (method === 'agent/done') {
			host.clearSuppressedRunId();
		}
		return;
	}
	if (method === 'agent/done') {
		const agentHost = createDroxChatAgentEventHost(host, tabs, agentDeps);
		// Toujours finaliser le run côté hôte (clear runId, busy:false) même si la webview
		// n'a pas encore ack webviewReady — sinon busy stale au retour focus (B-UI-07).
		dispatchAgentDone(agentHost, params);
		if (!webviewReady) {
			host.reconcileChatBusyState?.();
		}
		return;
	}
	if (!webviewReady) {
		return;
	}
	const agentHost = createDroxChatAgentEventHost(host, tabs, agentDeps);
	if (method === 'agent/event') {
		dispatchAgentEvent(agentHost, params);
	}
}
