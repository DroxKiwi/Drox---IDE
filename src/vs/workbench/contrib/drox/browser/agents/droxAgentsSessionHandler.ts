/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatProgress, IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem } from '../../../chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../chat/common/constants.js';
import {
	IChatAgentData,
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentService,
} from '../../../chat/common/participants/chatAgents.js';
import {
	cancelDroxAgentRun,
	IDroxAgentRunBridgeDeps,
	startDroxAgentRun,
} from '../../common/droxAgentRunBridge.js';
import { DROX_AGENT_ID, DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import { registerDroxAgentsWindowRun, unregisterDroxAgentsWindowRun } from '../../common/droxAgentsActiveRuns.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { extractAgentNotificationRunId } from '../droxChatAgentEvents.js';
import { parseDroxAgentsModelIdentifier } from '../../common/droxAgentsModels.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { isListableDroxSessionId } from '../../common/droxSession.js';
import { IDroxAttachmentsService } from '../../common/droxAttachmentsService.js';
import { prepareDroxNativeChatRunPrompt, extractImageAttachmentPayloads } from '../../common/droxNativeChatRequestAttachments.js';
import { buildUserPromptStickyPayload } from '../../common/chat/droxUserPromptSticky.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDroxAgentsChatSink, shouldHandleDroxAgentsEngineNotification } from './droxAgentsChatSink.js';
import { DroxNativeUiReplayRecorder } from './droxNativeUiReplayRecorder.js';
import { IDroxAgentsChatUiStatsService } from './droxAgentsChatUiStatsService.js';
import { buildDroxAgentsHistoryFromTranscript, buildDroxAgentsHistoryFromUiReplay } from './droxAgentsUiReplayHistory.js';

class DroxAgentsChatSession implements IChatSession {

	private readonly _onWillDispose = new Emitter<void>();
	readonly onWillDispose = this._onWillDispose.event;

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
	) { }

	dispose(): void {
		this._onWillDispose.fire();
		this._onWillDispose.dispose();
	}
}

export class DroxAgentsSessionHandler extends Disposable implements IChatSessionContentProvider {

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatService private readonly chatService: IChatService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxUserAskService private readonly userAskService: IDroxUserAskService,
		@IDroxClientToolsService private readonly clientToolsService: IDroxClientToolsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IDroxRunRevertService private readonly runRevertService: IDroxRunRevertService,
		@IDroxAgentsChatUiStatsService private readonly agentsUiStatsService: IDroxAgentsChatUiStatsService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IDroxChatSessionService private readonly chatSessionService: IDroxChatSessionService,
		@IDroxAttachmentsService private readonly attachmentsService: IDroxAttachmentsService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._registerAgent();
	}

	async provideChatSessionContent(sessionResource: URI, _token: CancellationToken): Promise<IChatSession> {
		const history = await this._loadSessionHistory(sessionResource);
		return new DroxAgentsChatSession(sessionResource, history);
	}

	private async _loadSessionHistory(sessionResource: URI): Promise<IChatSessionHistoryItem[]> {
		const engineSessionId = DroxChatSessionUri.parseSessionId(sessionResource);
		const workspacePath = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
		if (!engineSessionId || !workspacePath || !isListableDroxSessionId(engineSessionId)) {
			return [];
		}

		try {
			const uiReplay = await this.sessionService.readUiReplay(engineSessionId, workspacePath);
			if (uiReplay.length > 0) {
				return buildDroxAgentsHistoryFromUiReplay(uiReplay);
			}
			const read = await this.sessionService.readSession(engineSessionId, workspacePath);
			return buildDroxAgentsHistoryFromTranscript(read.messages);
		} catch (e) {
			this.logService.warn('[Drox Agents] failed to load session history for replay', e);
			return [];
		}
	}

	private _registerAgent(): void {
		const agentData: IChatAgentData = {
			id: DROX_AGENT_ID,
			name: DROX_AGENT_ID,
			fullName: localize('droxAgents.agentName', 'Drox'),
			description: localize('droxAgents.agentDescription', 'Local Drox agent (drox.exe)'),
			extensionId: new ExtensionIdentifier('drox.agents'),
			extensionVersion: undefined,
			extensionPublisherId: 'drox',
			extensionDisplayName: 'Drox',
			isDefault: true,
			isDynamic: true,
			isCore: true,
			metadata: { themeIcon: Codicon.sparkle },
			slashCommands: [],
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Agent],
			disambiguation: [],
		};

		const agentImpl: IChatAgentImplementation = {
			invoke: (request, progress, _history, token) => this._invokeAgent(request, progress, token),
		};

		this._register(this.chatAgentService.registerDynamicAgent(agentData, agentImpl));
	}

	private async _invokeAgent(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		token: CancellationToken,
	): Promise<IChatAgentResult> {
		const workspacePath = request.workingDirectory?.fsPath
			?? this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
		if (!workspacePath) {
			return {
				errorDetails: {
					message: localize('droxAgents.noWorkspace', 'Open a workspace folder before using Drox Agents.'),
				},
			};
		}

		const engineSessionId = DroxChatSessionUri.parseSessionId(request.sessionResource);
		if (!engineSessionId) {
			return {
				errorDetails: {
					message: localize('droxAgents.invalidSession', 'Invalid Drox session resource.'),
				},
			};
		}

		const mode = this.runSettingsService.getPermissionMode();
		this.userAskService.setActivePermissionMode(mode);
		this.userAskService.attachAgentsProgress(progress);

		const modelName = request.userSelectedModelId
			? parseDroxAgentsModelIdentifier(request.userSelectedModelId)
			: undefined;
		const preparedPrompt = await prepareDroxNativeChatRunPrompt(this.attachmentsService, {
			message: request.message,
			variables: request.variables,
			workspaceRoot: workspacePath,
			modelName,
		});
		if (!preparedPrompt.ok) {
			this.notificationService.error(preparedPrompt.message);
			return { errorDetails: { message: preparedPrompt.message } };
		}

		const uiReplayRecorder = new DroxNativeUiReplayRecorder(this.sessionService, engineSessionId, workspacePath);
		const imagePayloads = extractImageAttachmentPayloads(request.variables);
		const wireImages = imagePayloads.length > 0
			? imagePayloads.map(img => ({
				relPath: img.name ?? 'image',
				dataUrl: img.dataUrl ?? '',
			})).filter(img => img.dataUrl.length > 0)
			: undefined;
		const displayed = request.message;
		const trimmed = displayed.trim();
		uiReplayRecorder.record({
			kind: 'userPromptSticky',
			...buildUserPromptStickyPayload(displayed, trimmed, imagePayloads.length),
		});
		uiReplayRecorder.record({ kind: 'clearAssistant' });
		uiReplayRecorder.record({
			kind: 'append',
			role: 'user',
			text: displayed,
			messageId: `msg_${generateUuid()}`,
			images: wireImages,
		});

		const sink = createDroxAgentsChatSink(progress, {
			workspaceRoot: workspacePath,
			fileService: this.fileService,
			runRevertService: this.runRevertService,
			recordUiReplay: message => uiReplayRecorder.record(message),
		});
		this.agentsUiStatsService.resetCycleTimer();
		const bridgeDeps: IDroxAgentRunBridgeDeps = {
			clientToolsService: this.clientToolsService,
			runSettingsService: this.runSettingsService,
			droxEngineService: this.droxEngineService,
			logService: this.logService,
		};

		let activeRunId: string | undefined;
		const notificationStore = new DisposableStore();
		notificationStore.add(this.chatService.onDidReceiveQuestionCarouselAnswer(e => {
			this.userAskService.handleQuestionCarouselAnswer(e.resolveId, e.answers);
		}));
		notificationStore.add(this.droxEngineService.onNotification(e => {
			if (!shouldHandleDroxAgentsEngineNotification(activeRunId, e.method, e.params)) {
				return;
			}
			if (e.method === 'agent/event') {
				sink.handleAgentEvent(e.params);
				this.agentsUiStatsService.handleAgentEvent(e.params);
			} else if (e.method === 'agent/done') {
				sink.handleAgentDone(e.params);
				this.agentsUiStatsService.freezeCycleTimer();
			}
		}));
		notificationStore.add(token.onCancellationRequested(() => {
			this.userAskService.resolvePendingAsSkipped();
			if (activeRunId) {
				void cancelDroxAgentRun(
					{ droxEngineService: this.droxEngineService, logService: this.logService },
					activeRunId,
					'agent.cancel (agents window)',
				);
			}
		}));

		try {
			const runId = await startDroxAgentRun(bridgeDeps, {
				prompt: preparedPrompt.prompt,
				workspace: workspacePath,
				mode,
				sessionId: engineSessionId,
				images: preparedPrompt.images,
			});
			if (!runId) {
				return {
					errorDetails: {
						message: localize('droxAgents.runStartFailed', 'Drox could not start an agent run.'),
					},
				};
			}
			activeRunId = runId;
			registerDroxAgentsWindowRun(runId);
			this.chatSessionService.setSessionId(engineSessionId);
			this.chatSessionService.setRunId(runId);
			this.runRevertService.beginRun(runId, workspacePath, engineSessionId);

			const done = await this._waitForRunDone(runId, token);
			if (done.status === 'error' && done.error) {
				return { errorDetails: { message: done.error } };
			}
			return {};
		} catch (e) {
			if (isCancellationError(e)) {
				return {};
			}
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[Drox Agents] invoke failed', e);
			return { errorDetails: { message } };
		} finally {
			notificationStore.dispose();
			this.userAskService.attachAgentsProgress(undefined);
			if (activeRunId) {
				unregisterDroxAgentsWindowRun(activeRunId);
				if (this.chatSessionService.getRunId() === activeRunId) {
					this.chatSessionService.setRunId(undefined);
				}
				this.runRevertService.finalizeRun(activeRunId);
			}
			this.userAskService.setActivePermissionMode(undefined);
		}
	}

	private _waitForRunDone(runId: string, token: CancellationToken): Promise<{ status?: string; error?: string }> {
		return new Promise((resolve, reject) => {
			const store = new DisposableStore();
			store.add(token.onCancellationRequested(() => {
				store.dispose();
				reject(new CancellationError());
			}));
			store.add(this.droxEngineService.onNotification(e => {
				if (e.method !== 'agent/done') {
					return;
				}
				const doneRunId = extractAgentNotificationRunId(e.params);
				if (doneRunId !== runId) {
					return;
				}
				const p = e.params as { status?: string; error?: string };
				store.dispose();
				resolve(p);
			}));
		});
	}
}
