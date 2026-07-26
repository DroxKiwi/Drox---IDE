/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { join } from '../../../../../base/common/path.js';
import { observableValue } from '../../../../../base/common/observable.js';
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
import { formatDroxAgentsLoopAbortMessage } from '../../common/droxLoopAbort.js';
import { markDroxPlanArchivedForNextRun } from '../../common/droxPlanArchiveNote.js';
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
import { IDroxAgentRunImage } from '../../common/droxAttachments.js';
import { prepareDroxNativeChatRunPrompt, extractImageAttachmentPayloads } from '../../common/droxNativeChatRequestAttachments.js';
import { buildUserPromptStickyPayload } from '../../common/droxUserPromptSticky.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDroxAgentsChatSink, shouldHandleDroxAgentsEngineNotification } from './droxAgentsChatSink.js';
import { DroxNativeUiReplayRecorder } from './droxNativeUiReplayRecorder.js';
import { IDroxAgentsChatUiStatsService } from './droxAgentsChatUiStatsService.js';
import { IDroxSessionChangesBridge } from '../../common/droxSessionChangesBridge.js';
import { buildDroxAgentsHistoryFromTranscript, buildDroxAgentsHistoryFromUiReplay } from './droxAgentsUiReplayHistory.js';
import { IChatTodoListService } from '../../../chat/common/tools/chatTodoListService.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';
import { IDroxSessionBackgroundService } from '../../../../../sessions/contrib/drox/common/droxSessionBackgroundService.js';
import { DROX_SESSION_HISTORY_LOAD_TIMEOUT_MS, DROX_SESSION_HISTORY_TRANSCRIPT_TIMEOUT_MS } from '../droxLoadingConstants.js';
import { droxWorkspaceSessionsDir } from '../../common/droxWorkspacePaths.js';

/** Derniers tours user chargés à l'ouverture (évite un modèle chat géant en prod). */
const DROX_AGENTS_SESSION_INITIAL_TAIL_TURNS = 25;

const DROX_AGENTS_RETRY_DATA = { droxAgentsRetry: true as const };

interface IDroxAgentsLastRunContext {
	readonly prompt: string;
	readonly images?: readonly IDroxAgentRunImage[];
	readonly mode: string;
	readonly workspacePath: string;
	readonly engineSessionId: string;
}

class DroxAgentsChatSession implements IChatSession {

	private readonly _onWillDispose = new Emitter<void>();
	readonly onWillDispose = this._onWillDispose.event;

	/** Historique rechargé depuis disque : les réponses doivent être marquées complètes (cf. AgentHost). */
	readonly isCompleteObs = observableValue<boolean>('droxAgentsComplete', true);

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

	private readonly _lastRunBySession = new Map<string, IDroxAgentsLastRunContext>();

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatService private readonly chatService: IChatService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxUserAskService private readonly userAskService: IDroxUserAskService,
		@IDroxClientToolsService private readonly clientToolsService: IDroxClientToolsService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxRunRevertService private readonly runRevertService: IDroxRunRevertService,
		@IDroxAgentsChatUiStatsService private readonly agentsUiStatsService: IDroxAgentsChatUiStatsService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IDroxChatSessionService private readonly chatSessionService: IDroxChatSessionService,
		@IDroxAttachmentsService private readonly attachmentsService: IDroxAttachmentsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDroxSessionChangesBridge private readonly sessionChangesBridge: IDroxSessionChangesBridge,
		@IDroxSessionBackgroundService private readonly sessionBackgroundService: IDroxSessionBackgroundService,
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
	) {
		super();
		this._registerAgent();
	}

	async provideChatSessionContent(sessionResource: URI, _token: CancellationToken): Promise<IChatSession> {
		const history = await raceTimeout(
			this._loadSessionHistory(sessionResource),
			DROX_SESSION_HISTORY_LOAD_TIMEOUT_MS,
			() => this.logService.warn(
				`[Drox Agents] session history load timed out after ${DROX_SESSION_HISTORY_LOAD_TIMEOUT_MS}ms resource=${sessionResource.toString()}`,
			),
		) ?? [];
		return new DroxAgentsChatSession(sessionResource, history);
	}

	/**
	 * Prefer the Agents-window session workspace (multi-root / recent picks), then fall
	 * back to the IDE workbench folder so native chat can reload history without
	 * `DroxSessionsProvider` (IDE-only process).
	 */
	private async _resolveWorkspacePath(sessionResource: URI): Promise<string | undefined> {
		const provider = getDroxSessionsProviderInstance();
		if (provider) {
			const fromProvider = await raceTimeout(
				provider.ensureSessionWorkspacePath(sessionResource),
				2_000,
			);
			if (fromProvider) {
				return fromProvider;
			}
		}
		return this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}

	private async _loadSessionHistory(sessionResource: URI): Promise<IChatSessionHistoryItem[]> {
		const started = Date.now();
		const engineSessionId = DroxChatSessionUri.parseSessionId(sessionResource);
		const workspacePath = await this._resolveWorkspacePath(sessionResource);
		if (!engineSessionId || !workspacePath || !isListableDroxSessionId(engineSessionId)) {
			if (engineSessionId) {
				this.logService.warn(
					`[Drox Agents] session history skipped sessionId=${engineSessionId} workspacePath=${workspacePath ?? '(missing)'}`,
				);
			}
			return [];
		}

		try {
			const tail = await this.sessionService.readUiReplayTail(
				engineSessionId,
				workspacePath,
				{ maxTurns: DROX_AGENTS_SESSION_INITIAL_TAIL_TURNS },
			);
			if (tail.messages.length > 0) {
				const history = buildDroxAgentsHistoryFromUiReplay(tail.messages);
				if (history.length === 0) {
					this.logService.warn(
						`[Drox Agents] session history empty after ui replay sessionId=${engineSessionId} workspacePath=${workspacePath} events=${tail.messages.length}`,
					);
				} else {
					this.logService.info(
						`[Drox Agents] session history loaded sessionId=${engineSessionId} items=${history.length} events=${tail.messages.length}/${tail.totalEventCount} loadMs=${Date.now() - started}`,
					);
				}
				return history;
			}
			// `session.read` starts drox.exe — skip when no transcript on disk (new chat / cold IDE).
			const transcriptUri = URI.file(join(droxWorkspaceSessionsDir(workspacePath), `${engineSessionId}.jsonl`));
			if (!(await this.fileService.exists(transcriptUri))) {
				this.logService.info(
					`[Drox Agents] session history empty (no ui-replay/transcript) sessionId=${engineSessionId} loadMs=${Date.now() - started}`,
				);
				return [];
			}
			const read = await raceTimeout(
				this.sessionService.readSession(engineSessionId, workspacePath),
				DROX_SESSION_HISTORY_TRANSCRIPT_TIMEOUT_MS,
				() => this.logService.warn(
					`[Drox Agents] session.read timed out after ${DROX_SESSION_HISTORY_TRANSCRIPT_TIMEOUT_MS}ms sessionId=${engineSessionId}`,
				),
			);
			if (!read) {
				return [];
			}
			const history = buildDroxAgentsHistoryFromTranscript(read.messages);
			this.logService.info(
				`[Drox Agents] session history from transcript sessionId=${engineSessionId} items=${history.length} loadMs=${Date.now() - started}`,
			);
			return history;
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
			?? await this._resolveWorkspacePath(request.sessionResource);
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

		const sessionKey = request.sessionResource.toString();
		const isRetry = (request.acceptedConfirmationData ?? []).some(d =>
			!!d && typeof d === 'object' && (d as { droxAgentsRetry?: boolean }).droxAgentsRetry === true
		);
		const lastRun = this._lastRunBySession.get(sessionKey);

		const mode = this.runSettingsService.getPermissionMode();
		this.userAskService.setActivePermissionMode(mode);
		this.userAskService.attachAgentsProgress(progress);

		let runPrompt: string;
		let runImages: readonly IDroxAgentRunImage[] | undefined;
		let skipUserTurn = false;

		if (isRetry) {
			if (!lastRun) {
				return {
					errorDetails: {
						message: localize('droxAgents.retryUnavailable', 'Cannot retry — no previous run to restore.'),
					},
				};
			}
			runPrompt = lastRun.prompt;
			runImages = lastRun.images;
			skipUserTurn = true;
			try {
				await this.droxEngineService.request('session.truncateAfterLastUser', {
					id: engineSessionId,
					dir: droxWorkspaceSessionsDir(workspacePath),
				});
			} catch (e) {
				this.logService.warn('[Drox Agents] truncateAfterLastUser before retry failed', e);
			}
		} else {
			const modelName = request.userSelectedModelId
				? parseDroxAgentsModelIdentifier(request.userSelectedModelId)
				: undefined;
			const preparedPrompt = await prepareDroxNativeChatRunPrompt(this.attachmentsService, this.fileService, {
				message: request.message,
				variables: request.variables,
				workspaceRoot: workspacePath,
				modelName,
			});
			if (!preparedPrompt.ok) {
				this.notificationService.error(preparedPrompt.message);
				return { errorDetails: { message: preparedPrompt.message } };
			}
			runPrompt = preparedPrompt.prompt;
			runImages = preparedPrompt.images;
		}

		const uiReplayRecorder = new DroxNativeUiReplayRecorder(this.sessionService, engineSessionId, workspacePath);
		if (!isRetry) {
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
		} else {
			uiReplayRecorder.record({ kind: 'clearAssistant' });
		}

		const sink = createDroxAgentsChatSink(progress, {
			workspaceRoot: workspacePath,
			fileService: this.fileService,
			runRevertService: this.runRevertService,
			recordUiReplay: message => uiReplayRecorder.record(message),
			onFileChangeApplied: change => this.sessionChangesBridge.notifyFileChange(request.sessionResource, change),
			// 1.5.17 — contrat TUI run-centric : fin de run = plus de plan session actif.
			onAgentRunEnded: () => {
				markDroxPlanArchivedForNextRun(engineSessionId);
				this.chatTodoListService.setTodos(request.sessionResource, []);
			},
			// Pendant le run : alimenter le widget plan (sinon invisible — update tardif Copilot).
			onTodosUpdated: todoList => {
				this.chatTodoListService.setTodos(
					request.sessionResource,
					todoList.map((t, index) => {
						const parsedId = parseInt(t.id, 10);
						return {
							id: Number.isNaN(parsedId) ? index + 1 : parsedId,
							title: t.title,
							status: t.status,
						};
					}),
				);
			},
		});
		this.agentsUiStatsService.resetCycleTimer();
		const bridgeDeps: IDroxAgentRunBridgeDeps = {
			clientToolsService: this.clientToolsService,
			runSettingsService: this.runSettingsService,
			droxEngineService: this.droxEngineService,
			logService: this.logService,
			fileService: this.fileService,
		};

		this._lastRunBySession.set(sessionKey, {
			prompt: runPrompt,
			images: runImages,
			mode,
			workspacePath,
			engineSessionId,
		});

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
				prompt: runPrompt,
				workspace: workspacePath,
				mode,
				sessionId: engineSessionId,
				images: runImages,
				skipUserTurn: skipUserTurn || undefined,
				allowOutsideWorkspace: this.sessionBackgroundService.isAllowOutsideWorkspace(engineSessionId),
			});
			if (!runId) {
				return this._retryableError(localize('droxAgents.runStartFailed', 'Drox could not start an agent run.'));
			}
			activeRunId = runId;
			registerDroxAgentsWindowRun(runId);
			this.chatSessionService.setSessionId(engineSessionId);
			this.chatSessionService.setRunId(runId);
			this.runRevertService.beginRun(runId, workspacePath, engineSessionId);

			const done = await this._waitForRunDone(runId, token);
			if (done.status === 'error' && done.error) {
				return this._retryableError(formatDroxAgentsLoopAbortMessage(done.error));
			}
			return {};
		} catch (e) {
			if (isCancellationError(e)) {
				return {};
			}
			const message = e instanceof Error ? e.message : String(e);
			this.logService.error('[Drox Agents] invoke failed', e);
			return this._retryableError(formatDroxAgentsLoopAbortMessage(message));
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

	private _retryableError(message: string): IChatAgentResult {
		return {
			errorDetails: {
				message,
				isExpectedError: true,
				confirmationButtons: [{
					label: localize('droxAgents.retry', "Retry"),
					data: DROX_AGENTS_RETRY_DATA,
				}],
			},
		};
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
