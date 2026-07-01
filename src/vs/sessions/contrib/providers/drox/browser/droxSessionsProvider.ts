/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import {
	constObservable,
	derived,
	IObservable,
	ISettableObservable,
	observableValue,
} from '../../../../../base/common/observable.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	IChatSendRequestOptions,
	IChatService,
} from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import {
	ChatAgentLocation,
	ChatModeKind,
	ChatPermissionLevel,
} from '../../../../../workbench/contrib/chat/common/constants.js';
import {
	DROX_CHAT_SESSION_TYPE,
	DROX_SESSIONS_PROVIDER_ID,
	DroxChatSessionUri,
	DroxSessionType,
} from '../../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { IDroxLlmModelsService } from '../../../../../workbench/contrib/drox/common/droxLlmModelsService.js';
import {
	droxLlmSnapshotToLanguageModels,
	isDroxEmbeddingModelId,
	toDroxAgentsModelIdentifier,
} from '../../../../../workbench/contrib/drox/common/droxAgentsModels.js';
import { readDroxArchitectModelUser } from '../../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../../../../workbench/contrib/drox/common/droxConfiguration.js';
import { newSessionId } from '../../../../../workbench/contrib/drox/browser/droxChatTabs.js';
import { isListableDroxSessionId, deriveTitleFromTranscriptMessages, IDroxSessionListEntry } from '../../../../../workbench/contrib/drox/common/droxSession.js';
import { formatDroxSessionListLabel } from '../../../../../workbench/contrib/drox/common/droxNativeChatSessionResolver.js';
import { IDroxSessionService } from '../../../../../workbench/contrib/drox/common/droxSessionService.js';
import { IDroxEngineService } from '../../../../../workbench/contrib/drox/common/droxEngineService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import {
	IChat,
	ISession,
	ISessionFolder,
	ISessionType,
	ISessionWorkspace,
	SessionStatus,
	toSessionId,
	SESSION_WORKSPACE_GROUP_LOCAL,
} from '../../../../services/sessions/common/session.js';
import {
	ISendRequestOptions,
	ISessionChangeEvent,
	ISessionModelPickerOptions,
	ISessionsProvider,
} from '../../../../services/sessions/common/sessionsProvider.js';

/** Same key as {@link sessionWorkspacePicker.ts} — recent project folders in the Agents window. */
const SESSIONS_RECENT_WORKSPACES_STORAGE_KEY = 'sessions.recentlyPickedWorkspaces';

function buildChat(session: DroxSession): IChat {
	return {
		resource: session.resource,
		createdAt: session.createdAt,
		title: session.title,
		updatedAt: session.updatedAt,
		status: session.status,
		changes: constObservable([]),
		checkpoints: observableValue(session, undefined),
		modelId: session.modelId,
		mode: constObservable(undefined),
		isArchived: session.isArchived,
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
	};
}

class DroxSession extends Disposable implements ISession {

	readonly resource: URI;
	readonly sessionId: string;
	readonly providerId: string;
	readonly sessionType = DroxSessionType.id;
	readonly icon: ThemeIcon = DroxSessionType.icon;
	readonly createdAt: Date;

	private readonly _title = observableValue(this, localize('droxAgents.newSession', 'New Session'));
	readonly title: IObservable<string> = this._title;

	private readonly _updatedAt = observableValue(this, new Date());
	readonly updatedAt: IObservable<Date> = this._updatedAt;

	private readonly _status = observableValue(this, SessionStatus.Untitled);
	readonly status: IObservable<SessionStatus> = this._status;

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace: IObservable<ISessionWorkspace | undefined> = this._workspaceData;

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	readonly loading = constObservable(false);
	readonly isArchived = constObservable(false);
	readonly isRead = constObservable(true);
	readonly description = constObservable(undefined);
	readonly lastTurnEnd = constObservable(undefined);
	readonly mode = constObservable(undefined);
	readonly changes = constObservable([]);
	readonly changesets = constObservable([]);
	readonly mainChat: ISettableObservable<IChat>;
	readonly chats: IObservable<readonly IChat[]>;

	private _selectedModelId: string | undefined;

	readonly capabilities = {
		supportsMultipleChats: false,
		supportsRename: true,
		supportsDelete: true,
	};

	constructor(
		workspace: ISessionWorkspace,
		providerId: string,
		engineSessionId?: string,
		createdAt?: Date,
	) {
		super();
		this.providerId = providerId;
		const sessionKey = engineSessionId ?? newSessionId();
		this.resource = DroxChatSessionUri.forSession(sessionKey);
		this.createdAt = createdAt ?? new Date();
		this.sessionId = toSessionId(providerId, this.resource);
		this._workspaceData.set(workspace, undefined);
		this.mainChat = observableValue<IChat>(this, buildChat(this));
		this.chats = derived(this, reader => [this.mainChat.read(reader)]);
	}

	setTitle(title: string): void {
		this._title.set(title, undefined);
	}

	setStatus(status: SessionStatus): void {
		this._status.set(status, undefined);
	}

	setModelId(modelId: string | undefined): void {
		this._selectedModelId = modelId;
		this._modelIdObservable.set(modelId, undefined);
	}

	get selectedModelId(): string | undefined {
		return this._selectedModelId;
	}

	get workingDirectory(): URI | undefined {
		return this._workspaceData.get()?.folders[0]?.workingDirectory;
	}
}

export class DroxSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = DROX_SESSIONS_PROVIDER_ID;
	readonly label = localize('droxSessionsProvider', 'Drox');
	readonly icon = Codicon.sparkle;
	readonly order = -1;
	readonly browseActions: readonly [] = [];
	readonly supportsLocalWorkspaces = true;

	readonly sessionTypes: readonly ISessionType[] = [DroxSessionType];
	readonly onDidChangeSessionTypes = Event.None;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _sessionCache = new Map<string, DroxSession>();
	private readonly _newSessions = this._register(new DisposableMap<string, DroxSession>());
	private readonly _onDidChangeModels = this._register(new Emitter<void>());
	private _persistLoadStarted = false;
	private _persistLoadPromise: Promise<void> | undefined;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IDroxLlmModelsService private readonly llmModelsService: IDroxLlmModelsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		this._register(this.llmModelsService.onDidChange(() => this._onDidChangeModels.fire()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DroxSetting.ArchitectModel) || e.affectsConfiguration(DroxSetting.Model)) {
				this._onDidChangeModels.fire();
			}
		}));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			void this._loadPersistedSessions(true);
		}));
		this._register(this.droxEngineService.onDidInitialize(() => {
			void this._loadPersistedSessions(true);
		}));
		void this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			void this._loadPersistedSessions(true);
		});
		void this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
			void this._loadPersistedSessions(true);
		});
		this._startPersistedSessionLoad();
	}

	getSessions(): ISession[] {
		this._startPersistedSessionLoad();
		return [...this._sessionCache.values()].map(s => this._toISession(s));
	}

	private _startPersistedSessionLoad(): void {
		void this._loadPersistedSessions(false);
	}

	private async _loadPersistedSessions(refresh = false): Promise<void> {
		const roots = this._getPersistScanRoots();
		if (roots.length === 0) {
			// Agents window boots with an empty workspace file; folder is injected
			// later (IPC handoff or WorkspaceFolderManagement). Recent picks are
			// merged in _getPersistScanRoots once the user has used a project.
			return;
		}
		if (!refresh && this._persistLoadStarted) {
			return;
		}
		if (this._persistLoadPromise) {
			if (!refresh) {
				return this._persistLoadPromise;
			}
			await this._persistLoadPromise;
		}
		this._persistLoadPromise = this._doLoadPersistedSessions(roots).finally(() => {
			this._persistLoadPromise = undefined;
		});
		return this._persistLoadPromise;
	}

	private _getPersistScanRoots(): URI[] {
		const roots = new Map<string, URI>();
		for (const folder of this.workspaceService.getWorkspace().folders) {
			roots.set(folder.uri.toString(), folder.uri);
		}
		for (const uri of this._readRecentWorkspaceUris()) {
			roots.set(uri.toString(), uri);
		}
		return [...roots.values()];
	}

	private _readRecentWorkspaceUris(): URI[] {
		const raw = this.storageService.get(SESSIONS_RECENT_WORKSPACES_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const entries = JSON.parse(raw) as { readonly uri?: UriComponents }[];
			const out: URI[] = [];
			for (const entry of entries) {
				if (!entry?.uri) {
					continue;
				}
				const uri = URI.revive(entry.uri);
				if (uri.scheme === Schemas.file) {
					out.push(uri);
				}
			}
			return out;
		} catch {
			return [];
		}
	}

	private async _doLoadPersistedSessions(roots: readonly URI[]): Promise<void> {
		const added: ISession[] = [];
		try {
			for (const root of roots) {
				const workspacePath = root.fsPath;
				const entries = (await this.sessionService.listSessions(workspacePath))
					.filter(e => isListableDroxSessionId(e.id));
				const workspace = this.resolveWorkspace(root);
				if (!workspace) {
					continue;
				}
				for (const entry of entries) {
					const resource = DroxChatSessionUri.forSession(entry.id);
					const key = resource.toString();
					if (this._sessionCache.has(key) || this._newSessionsHasEngineId(entry.id)) {
						continue;
					}
					const session = new DroxSession(
						workspace,
						this.id,
						entry.id,
						new Date(entry.modifiedSecs * 1000),
					);
					session.setStatus(SessionStatus.Completed);
					if (entry.title?.trim()) {
						session.setTitle(entry.title.trim());
					}
					void this._enrichPersistedSessionTitle(session, entry, workspacePath);
					this._sessionCache.set(key, session);
					added.push(this._toISession(session));
				}
			}
			this._persistLoadStarted = true;
		} catch (e) {
			this.logService.warn('[DroxSessionsProvider] failed to load persisted sessions', e);
			return;
		}
		if (added.length > 0) {
			this._onDidChangeSessions.fire({ added, removed: [], changed: [] });
		}
	}

	private _newSessionsHasEngineId(engineSessionId: string): boolean {
		for (const session of this._newSessions.values()) {
			if (DroxChatSessionUri.parseSessionId(session.resource) === engineSessionId) {
				return true;
			}
		}
		return false;
	}

	private async _enrichPersistedSessionTitle(session: DroxSession, entry: IDroxSessionListEntry, workspacePath: string): Promise<void> {
		if (entry.title?.trim()) {
			return;
		}
		let title: string;
		try {
			const read = await this.sessionService.readSession(entry.id, workspacePath);
			title = deriveTitleFromTranscriptMessages(read.messages) || formatDroxSessionListLabel(entry);
		} catch {
			title = formatDroxSessionListLabel(entry);
		}
		session.setTitle(title);
		const iSession = this._toISession(session);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
	}

	resolveWorkspace(workspaceUri: URI): ISessionWorkspace | undefined {
		if (workspaceUri.scheme !== Schemas.file) {
			return undefined;
		}
		const folder: ISessionFolder = {
			root: workspaceUri,
			workingDirectory: workspaceUri,
			name: basename(workspaceUri),
			description: undefined,
		};
		return {
			uri: workspaceUri,
			label: basename(workspaceUri),
			description: this.labelService.getUriLabel(dirname(workspaceUri), { relative: false }),
			group: SESSION_WORKSPACE_GROUP_LOCAL,
			icon: Codicon.folder,
			folders: [folder],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		};
	}

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
		if (sessionTypeId !== DroxSessionType.id) {
			throw new Error(`Unsupported session type '${sessionTypeId}' for Drox provider`);
		}
		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}
		const session = new DroxSession(workspace, this.id);
		const preferredId = this.getPreferredModelId(session.sessionId);
		if (preferredId) {
			session.setModelId(preferredId);
		}
		this._newSessions.set(session.sessionId, session);
		return this._toISession(session);
	}

	deleteNewSession(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	getSessionTypes(_workspaceUri: URI): ISessionType[] {
		return [...this.sessionTypes];
	}

	get onDidChangeModels(): Event<void> {
		return this._onDidChangeModels.event;
	}

	getModels(_sessionId: string): readonly ILanguageModelChatMetadataAndIdentifier[] {
		const models = [...droxLlmSnapshotToLanguageModels(this.llmModelsService.snapshot)];
		const preferredId = this.getPreferredModelId(_sessionId);
		if (preferredId) {
			const index = models.findIndex(m => m.identifier === preferredId);
			if (index > 0) {
				const [preferred] = models.splice(index, 1);
				models.unshift(preferred);
			}
		}
		return models;
	}

	getPreferredModelId(_sessionId: string): string | undefined {
		const architect = readDroxArchitectModelUser(this.configurationService);
		if (!architect || isDroxEmbeddingModelId(architect)) {
			return undefined;
		}
		return toDroxAgentsModelIdentifier(architect);
	}

	getModelPickerOptions(_sessionId: string): ISessionModelPickerOptions {
		return {
			useGroupedModelPicker: false,
			showFeatured: false,
			showUnavailableFeatured: false,
			showManageModelsAction: true,
			showAutoModel: false,
		};
	}

	setModel(sessionId: string, modelId: string): void {
		const session = this._newSessions.get(sessionId) ?? this._findSession(sessionId);
		session?.setModelId(modelId);
	}

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			return this._sendFirstChat(newSession, chatResource, options);
		}
		const existing = this._findSession(sessionId);
		if (existing) {
			return this._sendExistingChat(existing, chatResource, options);
		}
		throw new Error(`Session '${sessionId}' not found`);
	}

	private async _sendFirstChat(
		session: DroxSession,
		chatResource: URI,
		options: ISendRequestOptions,
	): Promise<ISession> {
		if (chatResource.toString() !== session.resource.toString()) {
			throw new Error(`Chat resource mismatch for new Drox session`);
		}
		session.setTitle(options.query.split('\n')[0].substring(0, 100) || localize('droxAgents.newSession', 'New Session'));
		session.setStatus(SessionStatus.InProgress);
		const iSession = this._toISession(session);
		this._onDidChangeSessions.fire({ added: [iSession], removed: [], changed: [] });

		try {
			await this._dispatchSend(session, chatResource, options);
			this._sessionCache.set(session.resource.toString(), session);
			this._newSessions.deleteAndLeak(session.sessionId);
			session.setStatus(SessionStatus.Completed);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
			void this._loadPersistedSessions(true);
			return iSession;
		} catch (e) {
			this._newSessions.deleteAndLeak(session.sessionId);
			this._onDidChangeSessions.fire({ added: [], removed: [iSession], changed: [] });
			session.dispose();
			throw e;
		}
	}

	private async _sendExistingChat(
		session: DroxSession,
		chatResource: URI,
		options: ISendRequestOptions,
	): Promise<ISession> {
		session.setStatus(SessionStatus.InProgress);
		const iSession = this._toISession(session);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
		await this._dispatchSend(session, chatResource, options);
		session.setStatus(SessionStatus.Completed);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
		return iSession;
	}

	private async _dispatchSend(
		session: DroxSession,
		chatResource: URI,
		options: ISendRequestOptions,
	): Promise<void> {
		const architect = readDroxArchitectModelUser(this.configurationService);
		const modelId = architect && !isDroxEmbeddingModelId(architect)
			? toDroxAgentsModelIdentifier(architect)
			: session.selectedModelId;
		if (modelId) {
			session.setModelId(modelId);
		}
		const workingDirectory = session.workingDirectory;
		const modelRef = await this.chatService.acquireOrLoadSession(
			chatResource,
			ChatAgentLocation.Chat,
			CancellationToken.None,
		);
		try {
			if (modelRef && workingDirectory) {
				modelRef.object.setWorkingDirectory(workingDirectory);
			}
		} finally {
			modelRef?.dispose();
		}

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: modelId,
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: ChatPermissionLevel.Default,
			},
			agentIdSilent: DROX_CHAT_SESSION_TYPE,
			attachedContext: options.attachedContext,
		};

		this.logService.info(`[DroxSessionsProvider] sendRequest ${session.sessionId}`);
		const result = await this.chatService.sendRequest(chatResource, options.query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[DroxSessionsProvider] sendRequest rejected: ${result.reason}`);
		}
		if (result.kind === 'sent') {
			await result.data.responseCompletePromise;
		}
	}

	private _findSession(sessionId: string): DroxSession | undefined {
		for (const session of this._sessionCache.values()) {
			if (session.sessionId === sessionId) {
				return session;
			}
		}
		return undefined;
	}

	private _toISession(session: DroxSession): ISession {
		return session;
	}

	async renameChat(_sessionId: string, _chatUri: URI, _title: string): Promise<void> { }

	async renameSession(_sessionId: string, _title: string): Promise<void> { }

	async archiveSession(_sessionId: string): Promise<void> { }

	async unarchiveSession(_sessionId: string): Promise<void> { }

	async deleteSession(sessionId: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (!session) {
			return;
		}
		await this.chatService.removeHistoryEntry(session.resource);
		this._sessionCache.delete(session.resource.toString());
		this._onDidChangeSessions.fire({ added: [], removed: [this._toISession(session)], changed: [] });
		session.dispose();
	}

	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const id of sessionIds) {
			await this.deleteSession(id);
		}
	}

	async deleteChat(_sessionId: string, _chatUri: URI): Promise<void> { }

	async createNewChat(sessionId: string, _prompt?: string): Promise<IChat> {
		const session = this._findSession(sessionId) ?? this._newSessions.get(sessionId);
		if (!session) {
			throw new Error(`Session '${sessionId}' not found`);
		}
		return session.mainChat.get();
	}

	override dispose(): void {
		for (const session of this._sessionCache.values()) {
			session.dispose();
		}
		this._sessionCache.clear();
		super.dispose();
	}
}
