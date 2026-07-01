/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { IDroxEngineNotificationPayload } from '../common/droxIpc.js';
import { IDroxAttachmentPayload } from '../common/droxAttachments.js';
import { IDroxAttachmentsService } from '../common/droxAttachmentsService.js';
import { IDroxClientToolsService } from '../common/droxClientToolsService.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { applyDroxConfigurationUpdate } from '../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import {
	DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
	DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,
} from '../common/droxSharedChatSessionHistory.js';
import { readPermissionMode } from '../common/droxRunSettings.js';
import { droxConfigChangeAffectsArchitectSettings, droxConfigChangeAffectsGeneralSettings, droxConfigChangeAffectsPermissionMode, droxLlmSnapshotDiffersFromConfiguration } from '../common/droxChatConfigSync.js';
import {
	getProfessorModeRemovedNotificationMessage,
	isRemovedProfessorPermissionMode,
} from '../common/droxPermissionAsk.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';
import { IDroxSlashCommandService } from '../common/droxSlashCommandService.js';
import { IDroxUserAskService } from '../common/droxUserAskService.js';
import { IDroxRefsBridgeService } from '../common/droxRefsBridgeService.js';
import { IDroxPasteCandidateService } from '../common/droxPasteCandidateService.js';
import { takePendingForFileFinish } from '../common/droxFileMutation.js';
import { IDroxComposerBridgeService } from '../common/droxComposerBridgeService.js';
import { DroxHostToWebviewMessage, isDroxWebviewToHostMessage } from './droxChatBridge.js';
import { IDroxTranscriptMessage } from '../common/droxSession.js';
import { DroxChatDragAndDrop } from './droxChatDragAndDrop.js';
import { DroxChatLayoutStore } from './droxChatLayoutStore.js';
import { IDroxSessionService } from '../common/droxSessionService.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';
import { createDroxChatAgentEventHost, handleDroxEngineNotification, IDroxChatAgentBridgeHost } from './chat/droxChatAgentHost.js';
import { offerRunRecovery, getPendingRunRecovery, restoreRunRecoveryForSession } from './chat/droxChatRunRecovery.js';
import { IDroxChatAgentDoneHost } from './droxChatAgentEvents.js';
import { DroxChatTabsManager, DROX_CHAT_TAB_LOAD_FULL, IDroxChatTabsDelegate } from './chat/droxChatTabsManager.js';
import { IDroxChatSendRunHost } from './chat/droxChatSendRun.js';
import { pushGeneralSettingsToWebview } from './chat/droxChatGeneralSettings.js';
import { pushLlmModelsSnapshotToWebview, refreshDroxChatLlmModels } from './chat/droxChatLlmModels.js';
import { IDroxChatWebviewRouterDeps, IDroxChatWebviewRouterHost, routeDroxChatWebviewMessage } from './chat/droxChatWebviewRouter.js';
import { IDroxLlmModelsService } from '../common/droxLlmModelsService.js';
import { IDroxRunRevertService } from '../common/droxRunRevertService.js';
import { IDroxReleaseNotesService } from '../common/droxReleaseNotesService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { formatDroxChatVersionLabel, formatDroxChatVersionTitle } from '../common/droxProductVersion.js';

export class DroxChatController extends Disposable
	implements IDroxChatTabsDelegate, IDroxChatSendRunHost, IDroxChatWebviewRouterHost, IDroxChatAgentBridgeHost {

	private _webview?: IOverlayWebview;
	private _webviewReady = false;
	/** Rejeu du fil après attach webview (évite messages perdus avant `webviewReady`). */
	private _needsChatReplayOnReady = false;
	private _currentRunId?: string;
	private _suppressedRunId?: string;
	private _pendingRunStart = false;
	private _uiReplayRecordingEnabled = true;
	private readonly pendingTools = new Map<string, { name: string; args: unknown }>();
	private _chatDragDrop?: DroxChatDragAndDrop;
	private _peekedDropUris: string[] = [];
	private readonly _layoutStore: DroxChatLayoutStore;
	private readonly _tabs: DroxChatTabsManager;

	constructor(
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IDroxClientToolsService private readonly clientToolsService: IDroxClientToolsService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxUserAskService private readonly userAskService: IDroxUserAskService,
		@IDroxAttachmentsService private readonly attachmentsService: IDroxAttachmentsService,
		@IDroxSlashCommandService private readonly slashCommandService: IDroxSlashCommandService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IDroxChatSessionService private readonly chatSessionService: IDroxChatSessionService,
		@IDroxLongMemoryService private readonly longMemoryService: IDroxLongMemoryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@IDroxRefsBridgeService private readonly refsBridgeService: IDroxRefsBridgeService,
		@IDroxPasteCandidateService private readonly pasteCandidateService: IDroxPasteCandidateService,
		@IDroxComposerBridgeService private readonly composerBridgeService: IDroxComposerBridgeService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IOutputService private readonly outputService: IOutputService,
		@IDroxLlmModelsService private readonly llmModelsService: IDroxLlmModelsService,
		@IDroxRunRevertService private readonly runRevertService: IDroxRunRevertService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IStorageService private readonly storageService: IStorageService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService,
		@IDroxReleaseNotesService private readonly releaseNotesService: IDroxReleaseNotesService,
	) {
		super();
		this._layoutStore = new DroxChatLayoutStore(this.storageService);
		this._register(this.droxEngineService.onDidInitialize(() => this.postProductVersionToWebview()));
		const recencyListenerStore = this._register(new DisposableStore());
		this._tabs = new DroxChatTabsManager(
			this,
			this._layoutStore,
			this.workspaceContextService,
			this.sessionService,
			this.chatSessionService,
			this.storageService,
		);
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this._tabs.reloadTabsForWorkspace(this._webviewReady, this._currentRunId);
		}));
		this._register(this.droxEngineService.onNotification(e => this.onEngineNotification(e)));
		this._register(this.refsBridgeService.onAppendReferences(uris => {
			this.post({ kind: 'appendReferences', uris: [...uris] });
		}));
		this._register(this.pasteCandidateService.onDidUpdate(c => {
			this.post({ kind: 'pasteCandidate', candidate: c });
		}));
		this._register(this.composerBridgeService.onPrefillPrompt(req => {
			this.post({ kind: 'prefillPrompt', text: req.text, replace: req.replace });
		}));
		this._register(this.composerBridgeService.onRequestNewChat(() => {
			this._tabs.openNewChatTab();
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, recencyListenerStore)(() => {
			if (this._webviewReady) {
				void this._tabs.sendSessionsList();
			}
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, recencyListenerStore)(() => {
			if (this._webviewReady) {
				void this._tabs.sendSessionsList();
			}
		}));
		this._register(this.llmModelsService.onDidChange(snapshot => {
			if (!this._webviewReady) {
				return;
			}
			pushLlmModelsSnapshotToWebview(
				this,
				snapshot,
				this.runSettingsService,
				this.configurationService,
			);
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!this._webviewReady) {
				return;
			}
			if (droxConfigChangeAffectsPermissionMode(e)) {
				this.post({ kind: 'permissionMode', mode: this.runSettingsService.getPermissionMode() });
			}
			if (droxConfigChangeAffectsGeneralSettings(e)) {
				pushGeneralSettingsToWebview(this, this.runSettingsService, this.configurationService);
			}
			if (droxConfigChangeAffectsArchitectSettings(e)) {
				void refreshDroxChatLlmModels(this, this.llmModelsService, this.runSettingsService, this.configurationService);
			}
		}));
		this._register(this.runRevertService.onDidChangeRevertable(() => {
			if (this._webviewReady) {
				this.syncRunRevertState();
			}
		}));
		this._register(this.hostService.onDidChangeFocus(focus => {
			if (!focus || !this._webviewReady) {
				return;
			}
			this.reconcileChatBusyState();
			this.post({ kind: 'permissionMode', mode: this.runSettingsService.getPermissionMode() });
			pushGeneralSettingsToWebview(this, this.runSettingsService, this.configurationService);
			const workspaceResource = this.workspaceContextService.getWorkspace().folders[0]?.uri;
			if (droxLlmSnapshotDiffersFromConfiguration(this.llmModelsService.snapshot, this.configurationService, workspaceResource)) {
				void refreshDroxChatLlmModels(this, this.llmModelsService, this.runSettingsService, this.configurationService);
			}
		}));
	}

	reconcileChatBusyState(): void {
		this.post({ kind: 'state', busy: this.isRunActive() });
	}

	syncRunRevertState(): void {
		const snap = this.runRevertService.getLastRevertable();
		this.post({
			kind: 'runRevert',
			canRevert: this.runRevertService.hasRevertable(),
			fileCount: snap?.files.length ?? 0,
		});
	}

	attachWebview(webview: IOverlayWebview, targetWindow: CodeWindow, hitTestElement?: HTMLElement): void {
		this._webview = webview;
		this._webviewReady = false;
		this._needsChatReplayOnReady = true;
		this.userAskService.attachWebview(msg => this.post(msg));
		this._register(webview.onMessage(e => {
			void this.onWebviewMessage(e.message);
		}));
		const hitTest = hitTestElement ?? webview.container;
		this._chatDragDrop?.dispose();
		this._chatDragDrop = this._register(new DroxChatDragAndDrop(
			webview.container,
			targetWindow,
			hitTest,
			{
				onDragHover: active => this.post({ kind: 'dropHighlight', active }),
				onDragOverPeek: uris => { this._peekedDropUris = [...uris]; },
				onDropResult: result => {
					this._peekedDropUris = [];
					this.applyDropResult(result);
				},
			},
			this.fileService,
			this.logService,
		));
	}

	setUiReplayRecordingEnabled(enabled: boolean): void {
		this._uiReplayRecordingEnabled = enabled;
	}

	postProductVersionToWebview(): void {
		if (!this._webviewReady) {
			return;
		}
		const build = this.droxEngineService.engineDevBuild;
		this.post({
			kind: 'productVersion',
			label: formatDroxChatVersionLabel(this.productService, build),
			title: formatDroxChatVersionTitle(this.productService, {
				devBuild: build,
				gitSha: this.droxEngineService.engineGitSha,
				executablePath: this.droxEngineService.resolvedExecutable,
			}),
		});
	}

	post(message: DroxHostToWebviewMessage): void {
		let outgoing = message;
		if (message.kind === 'append') {
			const messageId =
				typeof message.messageId === 'string' && message.messageId.length > 0
					? message.messageId
					: `msg_${generateUuid()}`;
			outgoing = { ...message, messageId };
			const runId = this._currentRunId;
			if (runId) {
				this.runRevertService.recordRunMessage(runId, messageId);
			}
		}
		const sessionId = this._tabs.currentSessionId;
		const workspaceFsPath = this.workspaceRoot();
		if (this._uiReplayRecordingEnabled && sessionId && workspaceFsPath) {
			void this.sessionService.appendUiReplayMessage(sessionId, workspaceFsPath, outgoing);
		}
		if (!this._webview) {
			return;
		}
		void this._webview.postMessage(outgoing);
	}

	workspaceRoot(): string | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}

	workspaceUri(): URI | undefined {
		const root = this.workspaceRoot();
		return root ? URI.file(root) : undefined;
	}

	syncWebviewAfterAttach(): void {
		this._webviewReady = true;
		void this._tabs.ensureTabsReady().then(async mode => {
			if (!this._webviewReady) {
				return;
			}
			const sessionId = this._tabs.currentSessionId;
			const shouldReplay = this._needsChatReplayOnReady;
			this._needsChatReplayOnReady = false;
			if (sessionId && shouldReplay) {
				if (mode === 'restored' || mode === 'unchanged') {
					await this._tabs.activateChatTab(sessionId, DROX_CHAT_TAB_LOAD_FULL);
				} else if (mode === 'initial') {
					await this._tabs.activateChatTab(sessionId, { loadMessages: false });
				}
			}
			this._tabs.postTabs();
			this.reconcileChatBusyState();
			this.postProductVersionToWebview();
			this.migrateRemovedProfessorPermissionModeIfNeeded();
			this.post({ kind: 'permissionMode', mode: this.runSettingsService.getPermissionMode() });
			pushLlmModelsSnapshotToWebview(
				this,
				this.llmModelsService.snapshot,
				this.runSettingsService,
				this.configurationService,
			);
			pushGeneralSettingsToWebview(this, this.runSettingsService, this.configurationService);
			if (this._tabs.currentSessionId) {
				const tab = this._tabs.getActiveTab();
				this.post({
					kind: 'session',
					id: this._tabs.currentSessionId,
					uiStats: tab?.uiStats,
				});
			}
			this.pasteCandidateService.resync();
			this.syncRunRevertState();
			const recoverySessionId = this._tabs.currentSessionId;
			if (recoverySessionId && getPendingRunRecovery(recoverySessionId)) {
				offerRunRecovery(this.post.bind(this), recoverySessionId);
			}
		});
	}

	getChatDragDrop(): DroxChatDragAndDrop | undefined {
		return this._chatDragDrop;
	}

	getPeekedDropUris(): readonly string[] {
		return this._peekedDropUris;
	}

	setPeekedDropUris(uris: readonly string[]): void {
		this._peekedDropUris = [...uris];
	}

	applyDropResult(result: { readonly uris: readonly string[]; readonly attachments: readonly IDroxAttachmentPayload[] }): void {
		if (result.uris.length > 0) {
			this.post({ kind: 'appendReferences', uris: [...result.uris] });
		}
		if (result.attachments.length > 0) {
			this.post({ kind: 'appendAttachments', attachments: [...result.attachments] });
		}
	}

	syncChatSessionState(): void {
		this.chatSessionService.setSessionId(this._tabs.currentSessionId);
		this.chatSessionService.setRunId(this._currentRunId);
	}

	getCurrentRunId(): string | undefined {
		return this._currentRunId;
	}

	setCurrentRunId(runId: string | undefined): void {
		this._currentRunId = runId;
	}

	isRunActive(): boolean {
		return !!this._currentRunId || this._pendingRunStart;
	}

	setPendingRunStart(pending: boolean): void {
		this._pendingRunStart = pending;
	}

	clearCurrentRunId(): void {
		this._currentRunId = undefined;
		this._pendingRunStart = false;
	}

	getSuppressedRunId(): string | undefined {
		return this._suppressedRunId;
	}

	setSuppressedRunId(runId: string | undefined): void {
		this._suppressedRunId = runId;
	}

	clearSuppressedRunId(): void {
		this._suppressedRunId = undefined;
	}

	resolveUserAskSkipped(): void {
		this.userAskService.resolvePendingAsSkipped();
	}

	clearActivePermissionMode(): void {
		this.userAskService.setActivePermissionMode(undefined);
	}

	clearPendingTools(): void {
		this.pendingTools.clear();
	}

	agentEventHost(): IDroxChatAgentDoneHost {
		return createDroxChatAgentEventHost(this, this._tabs, this._agentHostDeps());
	}

	resetRunRevertUiState(): void {
		this.runRevertService.resetWorkspaceUiState();
		this.syncRunRevertState();
	}

	async onSessionReplayDone(
		sessionId: string,
		ctx: { readonly transcriptMessages: readonly IDroxTranscriptMessage[]; readonly uiReplayMessages?: readonly DroxHostToWebviewMessage[] },
	): Promise<void> {
		const ws = this.workspaceRoot();
		if (!ws || sessionId !== this._tabs.currentSessionId) {
			return;
		}
		const restored = await restoreRunRecoveryForSession(
			this.sessionService,
			this.runSettingsService,
			ws,
			sessionId,
			ctx,
		);
		if (restored) {
			offerRunRecovery(this.post.bind(this), sessionId);
		}
	}

	getPendingTool(id: string): { name: string; args: unknown } | undefined {
		return this.pendingTools.get(id);
	}

	setPendingTool(id: string, entry: { name: string; args: unknown }): void {
		this.pendingTools.set(id, entry);
	}

	deletePendingTool(id: string): void {
		this.pendingTools.delete(id);
	}

	takePendingToolForFileFinish(id: string, output: unknown): { name: string; args: unknown } | undefined {
		return takePendingForFileFinish(this.pendingTools, id, output);
	}

	private migrateRemovedProfessorPermissionModeIfNeeded(): void {
		const resource = this.workspaceUri();
		const raw = readPermissionMode(this.configurationService, resource);
		if (!isRemovedProfessorPermissionMode(raw)) {
			return;
		}
		this.notificationService.warn(getProfessorModeRemovedNotificationMessage());
		void applyDroxConfigurationUpdate(this.configurationService, DroxSetting.PermissionMode, 'imNotCrazy', resource);
	}

	private _webviewRouterDeps(): IDroxChatWebviewRouterDeps {
		return {
			userAskService: this.userAskService,
			dialogService: this.dialogService,
			notificationService: this.notificationService,
			attachmentsService: this.attachmentsService,
			fileService: this.fileService,
			clientToolsService: this.clientToolsService,
			runSettingsService: this.runSettingsService,
			droxEngineService: this.droxEngineService,
			logService: this.logService,
			slashCommandService: this.slashCommandService,
			commandService: this.commandService,
			editorService: this.editorService,
			terminalService: this.terminalService,
			configurationService: this.configurationService,
			requestService: this.requestService,
			outputService: this.outputService,
			llmModelsService: this.llmModelsService,
			runRevertService: this.runRevertService,
			sessionService: this.sessionService,
			clipboardService: this.clipboardService,
			workspaceContextService: this.workspaceContextService,
			productService: this.productService,
			releaseNotesService: this.releaseNotesService,
		};
	}

	private _agentHostDeps(): Parameters<typeof createDroxChatAgentEventHost>[2] {
		return {
			chatSessionService: this.chatSessionService,
			longMemoryService: this.longMemoryService,
			configurationService: this.configurationService,
			outputService: this.outputService,
			editorService: this.editorService,
			notificationService: this.notificationService,
			logService: this.logService,
			runSettingsService: this.runSettingsService,
			runRevertService: this.runRevertService,
			hostService: this.hostService,
			fileService: this.fileService,
		};
	}

	private async onWebviewMessage(raw: unknown): Promise<void> {
		if (!isDroxWebviewToHostMessage(raw)) {
			return;
		}
		await routeDroxChatWebviewMessage(this, this._tabs, this._webviewRouterDeps(), raw);
	}

	private onEngineNotification(payload: IDroxEngineNotificationPayload): void {
		handleDroxEngineNotification(this._webviewReady, this, this._tabs, this._agentHostDeps(), payload);
	}
}
