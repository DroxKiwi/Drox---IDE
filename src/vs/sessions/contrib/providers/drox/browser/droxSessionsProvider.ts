/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import {
	autorun,
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
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	ChatSendResult,
	IChatSendRequestOptions,
	IChatService,
} from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
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
import { markDroxEngineSessionOpened, removeDroxEngineSessionFromRecency } from '../../../../../workbench/contrib/drox/common/droxSharedChatSessionHistory.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import {
	IChat,
	ISessionChangesSummary,
	ISessionFileChange,
	ISession,
	ISessionChangeset,
	ISessionFolder,
	ISessionGitRepository,
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
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { droxSessionChangePathKey, normalizeWindowsFsPath } from '../../../../../workbench/contrib/drox/common/droxPathUtil.js';
import { IDroxFileChangePayload } from '../../../../../workbench/contrib/drox/common/droxFileChange.js';
import { enrichDroxFileChangeSnapshotAsync } from '../../../../../workbench/contrib/drox/common/droxFileChangeProgress.js';
import { IDroxSessionChangesBridge } from '../../../../../workbench/contrib/drox/common/droxSessionChangesBridge.js';
import { IDroxSessionChangesDetailService } from '../../../../../workbench/contrib/drox/common/droxSessionChangesDetailService.js';
import { IDroxSessionChangesPanelService } from '../../../../../workbench/contrib/drox/common/droxSessionChangesPanelService.js';
import { readDroxSessionMeta, writeDroxSessionMeta } from '../../../../../workbench/contrib/drox/common/droxSessionMetaFs.js';
import { ensureDroxSessionNotesFile } from '../../../../../workbench/contrib/drox/common/droxSessionNotesFs.js';
import { buildAggregatedSessionFileChanges } from '../../../../../workbench/contrib/drox/common/droxSessionChangesAggregate.js';
import {
	collectCommittedChangeEventKeys,
	loadDroxGitDirtyPathKeys,
	loadDroxGitUncommittedChanges,
	mergeDroxSessionFileChanges,
} from '../../../../../workbench/contrib/drox/common/droxSessionGitChanges.js';
import { droxChangeEventKey } from '../../../../../workbench/contrib/drox/common/droxChangeEventKey.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { createDroxSessionChangesets } from './droxSessionChangesets.js';

/** Same key as {@link sessionWorkspacePicker.ts} — recent project folders in the Agents window. */
const SESSIONS_RECENT_WORKSPACES_STORAGE_KEY = 'sessions.recentlyPickedWorkspaces';
const MAX_RECENT_WORKSPACES = 20;

function sessionFileChangeUri(change: ISessionFileChange): URI {
	const uri = (change as IChatSessionFileChange2).uri;
	return uri ?? change.modifiedUri;
}

function buildChat(session: DroxSession): IChat {
	return {
		resource: session.resource,
		createdAt: session.createdAt,
		title: session.title,
		updatedAt: session.updatedAt,
		status: session.status,
		changes: session.changes,
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
	private readonly _changes = observableValue<readonly ISessionFileChange[]>(this, []);
	readonly changes = this._changes;
	private readonly _changesSummary = observableValue<ISessionChangesSummary | undefined>(this, undefined);
	readonly changesSummary = this._changesSummary;
	private readonly _changesets: readonly ISessionChangeset[];
	readonly changesets: IObservable<readonly ISessionChangeset[]>;
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
		this._changesets = createDroxSessionChangesets(this.chats);
		this.changesets = constObservable(this._changesets);
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

	applyFileChangeLive(change: IDroxFileChangePayload): void {
		if (!change.applied) {
			return;
		}
		const uri = URI.file(normalizeWindowsFsPath(change.path));
		const current = [...this._changes.get()];
		const index = current.findIndex(c => sessionFileChangeUri(c).toString() === uri.toString());
		const previous = index >= 0 ? current[index] : undefined;
		const entry: IChatSessionFileChange2 = {
			uri,
			insertions: (previous?.insertions ?? 0) + change.added,
			deletions: (previous?.deletions ?? 0) + change.removed,
		};
		if (index >= 0) {
			current[index] = entry;
		} else {
			current.push(entry);
		}
		this.setChanges(current);
	}

	setChanges(changes: readonly ISessionFileChange[]): void {
		this._changes.set(changes, undefined);
		let additions = 0;
		let deletions = 0;
		for (const change of changes) {
			additions += change.insertions;
			deletions += change.deletions;
		}
		this._changesSummary.set(
			changes.length > 0
				? { files: changes.length, additions, deletions }
				: undefined,
			undefined,
		);
	}

	updateWorkspace(workspace: ISessionWorkspace): void {
		this._workspaceData.set(workspace, undefined);
	}

	private readonly _modelTracker = this._register(new MutableDisposable());

	/**
	 * Subscribe to live chat model status (streaming, tool wait, completion).
	 * Replaces any prior subscription; disposed with the session.
	 */
	trackModel(model: IChatModel, onChange: () => void): void {
		this._modelTracker.value = autorun(reader => {
			const needsInput = model.requestNeedsInput.read(reader);
			const inProgress = model.requestInProgress.read(reader);
			const hasActive = model.hasActiveRequest.read(reader);
			let status: SessionStatus;
			if (needsInput) {
				status = SessionStatus.NeedsInput;
			} else if (inProgress || hasActive) {
				status = SessionStatus.InProgress;
			} else {
				status = SessionStatus.Completed;
			}
			this._status.set(status, undefined);
			onChange();
		});
	}
}

export class DroxSessionsProvider extends Disposable implements ISessionsProvider {

	private static _isEngineNotStartedError(e: unknown): boolean {
		return e instanceof Error && e.message === 'Drox engine not started for this window';
	}

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
	private _persistRefreshPending = false;
	private readonly _syncGeneration = new Map<string, number>();
	private readonly _gitWatchStores = new Map<string, DisposableStore>();
	/** Last known git dirty path keys per workspace — prune history only on dirty→clean. */
	private readonly _lastGitDirtyPathKeysByWorkspace = new Map<string, ReadonlySet<string>>();
	/** Workspaces that have had a non-empty dirty set at least once (avoids wiping history before first git status). */
	private readonly _workspaceHasSeenDirty = new Set<string>();
	/** Sessions whose ui-replay fileChange events were loaded into the detail service. */
	private readonly _fileChangesHydratedSessions = new Set<string>();
	/** workspacePath → session resource strings that contribute Changes history. */
	private readonly _workspaceChangeSessionResources = new Map<string, Set<string>>();
	private readonly _workspaceFileChangesHydratePromises = new Map<string, Promise<void>>();
	/** Sessions for which git watch + changes replay have been started (lazy — not at boot). */
	private readonly _activatedSessionKeys = new Set<string>();

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
		@IDroxSessionChangesBridge private readonly sessionChangesBridge: IDroxSessionChangesBridge,
		@IDroxSessionChangesDetailService private readonly sessionChangesDetailService: IDroxSessionChangesDetailService,
		@IDroxSessionChangesPanelService private readonly sessionChangesPanelService: IDroxSessionChangesPanelService,
		@IGitService private readonly gitService: IGitService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._register(this.chatService.onDidSubmitRequest(e => {
			const session = this._findSessionByResource(e.chatSessionResource);
			if (session) {
				this._syncSessionFromModel(session);
			}
		}));
		this._register(this.sessionChangesBridge.onDidApplyFileChange(e => {
			this.sessionChangesDetailService.appendFileChange(e.sessionResource, e.change);
			const session = this._findSessionByResource(e.sessionResource);
			if (!session) {
				return;
			}
			void this._syncSessionFileChangesSummary(session, true);
		}));
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
	}

	getSessions(): ISession[] {
		if (this.droxEngineService.isInitialized) {
			void this._loadPersistedSessions(false);
		}
		const seen = new Set<string>();
		const sessions: ISession[] = [];
		const push = (session: DroxSession): void => {
			const key = session.resource.toString();
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			sessions.push(this._toISession(session));
		};
		for (const session of this._sessionCache.values()) {
			push(session);
		}
		// In-flight first sends still live in _newSessions until promoted; include both.
		for (const session of this._newSessions.values()) {
			push(session);
		}
		return sessions;
	}

	private async _loadPersistedSessions(refresh = false): Promise<void> {
		const roots = this._getPersistScanRoots();
		if (roots.length === 0) {
			// Agents window boots with an empty workspace file; folder is injected
			// later (IPC handoff or WorkspaceFolderManagement). Recent picks are
			// merged in _getPersistScanRoots once the user has used a project.
			return;
		}
		if (!this.droxEngineService.isInitialized) {
			// listSessions RPC needs a started engine; onDidInitialize retriggers.
			return;
		}
		if (!refresh && this._persistLoadStarted) {
			return;
		}
		if (this._persistLoadPromise) {
			if (refresh) {
				this._persistRefreshPending = true;
			}
			return this._persistLoadPromise;
		}
		this._persistLoadPromise = this._doLoadPersistedSessions(roots).finally(() => {
			this._persistLoadPromise = undefined;
			if (this._persistRefreshPending) {
				this._persistRefreshPending = false;
				void this._loadPersistedSessions(true);
			}
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

	private _touchRecentWorkspace(folderUri: URI): void {
		type StoredRecent = { readonly uri: UriComponents; readonly providerId?: string };
		let stored: StoredRecent[] = [];
		const raw = this.storageService.get(SESSIONS_RECENT_WORKSPACES_STORAGE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				stored = JSON.parse(raw) as StoredRecent[];
			} catch {
				stored = [];
			}
		}
		const folderKey = folderUri.toString();
		const filtered = stored.filter(entry => URI.revive(entry.uri).toString() !== folderKey);
		const updated: StoredRecent[] = [
			{ uri: folderUri.toJSON(), providerId: this.id },
			...filtered,
		].slice(0, MAX_RECENT_WORKSPACES);
		this.storageService.store(
			SESSIONS_RECENT_WORKSPACES_STORAGE_KEY,
			JSON.stringify(updated),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}

	private _commitSessionToCache(session: DroxSession): void {
		const key = session.resource.toString();
		if (!this._sessionCache.has(key)) {
			this._sessionCache.set(key, session);
		}
		if (this._newSessions.has(session.sessionId)) {
			this._newSessions.deleteAndLeak(session.sessionId);
		}
		const folder = session.workingDirectory;
		if (folder) {
			const engineId = DroxChatSessionUri.parseSessionId(session.resource);
			if (engineId) {
				markDroxEngineSessionOpened(this.storageService, folder.fsPath, engineId);
			}
		}
	}

	private _attachSendCompletionHandlers(session: DroxSession, iSession: ISession, result: ChatSendResult): void {
		if (result.kind === 'queued') {
			void result.deferred.then(
				(processed: ChatSendResult) => this._attachSendCompletionHandlers(session, iSession, processed),
				(err: unknown) => this.logService.error('[DroxSessionsProvider] queued send failed', err),
			);
			return;
		}
		if (result.kind !== 'sent') {
			return;
		}
		this._syncSessionFromModel(session, iSession);
		const complete = result.data.responseCompletePromise;
		if (!complete) {
			return;
		}
		void complete.then(() => {
			void this._loadPersistedSessions(true);
			// Agent may have committed/pushed via shell — re-read git uncommitted so Changes +/− update.
			void this._syncSessionFileChangesSummary(session, true);
		}, err => {
			this.logService.error('[DroxSessionsProvider] response failed', err);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
		});
	}

	private _syncSessionFromModel(session: DroxSession, iSession?: ISession): void {
		const model = this.chatService.getSession(session.resource);
		if (!model) {
			return;
		}
		const notify = (): void => {
			this._onDidChangeSessions.fire({
				added: [],
				removed: [],
				changed: [iSession ?? this._toISession(session)],
			});
		};
		session.trackModel(model, notify);
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
					const metaTitle = await readDroxSessionMeta(this.fileService, workspacePath, entry.id);
					if (metaTitle?.customTitle) {
						session.setTitle(metaTitle.customTitle);
					} else if (entry.title?.trim()) {
						session.setTitle(entry.title.trim());
					}
					if (!metaTitle?.customTitle && !entry.title?.trim()) {
						void this._enrichPersistedSessionTitle(session, entry, workspacePath);
					}
					this._sessionCache.set(key, session);
					added.push(this._toISession(session));
				}
			}
			this._persistLoadStarted = true;
		} catch (e) {
			if (!DroxSessionsProvider._isEngineNotStartedError(e)) {
				this.logService.warn('[DroxSessionsProvider] failed to load persisted sessions', e);
			}
			return;
		}
		if (added.length > 0) {
			this._onDidChangeSessions.fire({ added, removed: [], changed: [] });
		}
	}

	private async _syncSessionFileChangesSummary(session: DroxSession, fireEvent = false): Promise<void> {
		const key = session.resource.toString();
		const generation = (this._syncGeneration.get(key) ?? 0) + 1;
		this._syncGeneration.set(key, generation);

		const workspace = session.workspace.get();
		const workspacePath = workspace?.folders[0]?.root.fsPath;
		if (workspacePath) {
			this._trackWorkspaceChangeSession(workspacePath, session.resource);
			await this._ensureWorkspaceFileChangesHydrated(workspacePath);
			if (this._syncGeneration.get(key) !== generation) {
				return;
			}
		}

		let dirtyPathKeys: Set<string> | undefined;
		try {
			dirtyPathKeys = await loadDroxGitDirtyPathKeys(this.gitService, workspace);
			if (this._syncGeneration.get(key) !== generation) {
				return;
			}
			if (workspacePath && dirtyPathKeys !== undefined) {
				if (dirtyPathKeys.size > 0) {
					this._workspaceHasSeenDirty.add(workspacePath);
				}
				const previouslyDirty = this._lastGitDirtyPathKeysByWorkspace.get(workspacePath);
				this._lastGitDirtyPathKeysByWorkspace.set(workspacePath, dirtyPathKeys);
				if (previouslyDirty && previouslyDirty.size > 0) {
					await this._pruneCommittedChangeHistoryForWorkspace(workspacePath, previouslyDirty, dirtyPathKeys);
				}
			}
		} catch (e) {
			this.logService.warn('[DroxSessionsProvider] failed to load git dirty paths', e);
		}

		const eventsFilter = this._dirtyFilterForWorkspace(workspacePath, dirtyPathKeys);
		const events = workspacePath
			? this._collectWorkspaceChangeEvents(workspacePath, eventsFilter)
			: this.sessionChangesPanelService.filterDismissed(
				session.resource,
				this.sessionChangesDetailService.getSessionChangeEvents(session.resource),
			);
		const sessionChanges = buildAggregatedSessionFileChanges(events);

		let merged = sessionChanges;
		try {
			const gitChanges = await loadDroxGitUncommittedChanges(this.gitService, workspace);
			if (this._syncGeneration.get(key) !== generation) {
				return;
			}
			if (gitChanges !== undefined) {
				merged = mergeDroxSessionFileChanges(sessionChanges, gitChanges);
			}
		} catch (e) {
			this.logService.warn('[DroxSessionsProvider] failed to load git uncommitted changes', e);
		}

		if (this._syncGeneration.get(key) !== generation) {
			return;
		}
		if (!this._sessionFileChangesDiffer(session.changes.get(), merged)) {
			return;
		}
		session.setChanges(merged);
		if (fireEvent) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
		}
	}

	/**
	 * Events agent de toutes les sessions du workspace, optionnellement limités aux
	 * chemins encore dirty (working tree branche).
	 */
	getWorkspaceFileChangeEvents(sessionResource: URI): readonly IDroxFileChangePayload[] {
		const workspacePath = this.getSessionWorkspacePath(sessionResource);
		if (!workspacePath) {
			return this.sessionChangesPanelService.filterDismissed(
				sessionResource,
				this.sessionChangesDetailService.getSessionChangeEvents(sessionResource),
			);
		}
		void this._ensureWorkspaceFileChangesHydrated(workspacePath);
		this._trackWorkspaceChangeSession(workspacePath, sessionResource);
		const dirtyPathKeys = this._lastGitDirtyPathKeysByWorkspace.has(workspacePath)
			? this._lastGitDirtyPathKeysByWorkspace.get(workspacePath)
			: undefined;
		return this._collectWorkspaceChangeEvents(
			workspacePath,
			this._dirtyFilterForWorkspace(workspacePath, dirtyPathKeys),
		);
	}

	/**
	 * `undefined` = ne pas filtrer (git indisponible ou status pas encore vu).
	 * `Set` (éventuellement vide) = limiter aux chemins dirty.
	 */
	private _dirtyFilterForWorkspace(
		workspacePath: string | undefined,
		dirtyPathKeys: ReadonlySet<string> | undefined,
	): ReadonlySet<string> | undefined {
		if (!workspacePath || dirtyPathKeys === undefined) {
			return undefined;
		}
		if (dirtyPathKeys.size > 0) {
			return dirtyPathKeys;
		}
		// Empty dirty before we've ever seen dirty files → likely status lag, keep history.
		if (!this._workspaceHasSeenDirty.has(workspacePath)) {
			return undefined;
		}
		return dirtyPathKeys;
	}

	async dismissWorkspaceChangeKeys(sessionResource: URI, keys: readonly string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}
		const workspacePath = await this.ensureSessionWorkspacePath(sessionResource);
		if (!workspacePath) {
			return;
		}
		await this._ensureWorkspaceFileChangesHydrated(workspacePath);
		const keySet = new Set(keys);
		for (const resource of this._workspaceChangeSessionResourceUris(workspacePath)) {
			const events = this.sessionChangesDetailService.getSessionChangeEvents(resource);
			const sessionKeys = events
				.map((change, index) => droxChangeEventKey(change, index))
				.filter(k => keySet.has(k));
			if (sessionKeys.length === 0) {
				continue;
			}
			const engineSessionId = DroxChatSessionUri.parseSessionId(resource);
			if (!engineSessionId) {
				continue;
			}
			await this.sessionChangesPanelService.dismissChanges(resource, engineSessionId, workspacePath, sessionKeys);
		}
		const session = this._findSessionByResource(sessionResource);
		if (session) {
			void this._syncSessionFileChangesSummary(session, true);
		}
	}

	async cleanWorkspaceChangeHistory(sessionResource: URI): Promise<void> {
		const events = this.getWorkspaceFileChangeEvents(sessionResource);
		const keys = events.map((change, index) => droxChangeEventKey(change, index));
		await this.dismissWorkspaceChangeKeys(sessionResource, keys);
	}

	private _trackWorkspaceChangeSession(workspacePath: string, sessionResource: URI): void {
		let set = this._workspaceChangeSessionResources.get(workspacePath);
		if (!set) {
			set = new Set();
			this._workspaceChangeSessionResources.set(workspacePath, set);
		}
		set.add(sessionResource.toString());
	}

	private _workspaceChangeSessionResourceUris(workspacePath: string): URI[] {
		const keys = new Set<string>(this._workspaceChangeSessionResources.get(workspacePath));
		for (const session of this._sessionCache.values()) {
			if (session.workspace.get()?.folders[0]?.root.fsPath === workspacePath) {
				keys.add(session.resource.toString());
			}
		}
		for (const session of this._newSessions.values()) {
			if (session.workspace.get()?.folders[0]?.root.fsPath === workspacePath) {
				keys.add(session.resource.toString());
			}
		}
		return [...keys].map(k => URI.parse(k));
	}

	private _collectWorkspaceChangeEvents(
		workspacePath: string,
		dirtyPathKeys: ReadonlySet<string> | undefined,
	): IDroxFileChangePayload[] {
		const out: IDroxFileChangePayload[] = [];
		const seen = new Set<string>();
		for (const resource of this._workspaceChangeSessionResourceUris(workspacePath)) {
			const raw = this.sessionChangesDetailService.getSessionChangeEvents(resource);
			const filtered = this.sessionChangesPanelService.filterDismissed(resource, raw);
			for (let i = 0; i < filtered.length; i++) {
				const change = filtered[i]!;
				if (dirtyPathKeys && !dirtyPathKeys.has(droxSessionChangePathKey(change.path))) {
					continue;
				}
				const eventKey = droxChangeEventKey(change, i);
				if (seen.has(eventKey)) {
					continue;
				}
				seen.add(eventKey);
				out.push(change);
			}
		}
		return out;
	}

	private async _ensureWorkspaceFileChangesHydrated(workspacePath: string): Promise<void> {
		const existing = this._workspaceFileChangesHydratePromises.get(workspacePath);
		if (existing) {
			return existing;
		}
		const pending = this._doEnsureWorkspaceFileChangesHydrated(workspacePath).finally(() => {
			this._workspaceFileChangesHydratePromises.delete(workspacePath);
		});
		this._workspaceFileChangesHydratePromises.set(workspacePath, pending);
		return pending;
	}

	private async _doEnsureWorkspaceFileChangesHydrated(workspacePath: string): Promise<void> {
		let entries: Awaited<ReturnType<IDroxSessionService['listSessions']>> = [];
		try {
			entries = (await this.sessionService.listSessions(workspacePath))
				.filter(e => isListableDroxSessionId(e.id));
		} catch (e) {
			this.logService.warn('[DroxSessionsProvider] failed to list sessions for workspace changes', e);
			return;
		}
		for (const entry of entries) {
			const resource = DroxChatSessionUri.forSession(entry.id);
			const sessionKey = resource.toString();
			this._trackWorkspaceChangeSession(workspacePath, resource);
			if (this._fileChangesHydratedSessions.has(sessionKey)) {
				continue;
			}
			this._fileChangesHydratedSessions.add(sessionKey);
			try {
				const replay = await this.sessionService.readUiReplay(entry.id, workspacePath);
				const replayEvents: IDroxFileChangePayload[] = [];
				for (const message of replay) {
					if (message.kind !== 'fileChange' || message.applied === false) {
						continue;
					}
					replayEvents.push(await enrichDroxFileChangeSnapshotAsync(message, workspacePath, this.fileService));
				}
				this.sessionChangesDetailService.mergeSessionChangeEvents(resource, replayEvents);
				await this.sessionChangesPanelService.applyPersistedDismissals(resource, entry.id, workspacePath);
			} catch {
				// ignore missing replay for sibling sessions
			}
		}
	}

	/** Retire l'historique panneau pour les chemins dirty→clean, toutes sessions du workspace. */
	private async _pruneCommittedChangeHistoryForWorkspace(
		workspacePath: string,
		previouslyDirty: ReadonlySet<string>,
		currentlyDirty: ReadonlySet<string>,
	): Promise<void> {
		for (const resource of this._workspaceChangeSessionResourceUris(workspacePath)) {
			const events = this.sessionChangesDetailService.getSessionChangeEvents(resource);
			if (events.length === 0) {
				continue;
			}
			const committedKeys = collectCommittedChangeEventKeys(events, previouslyDirty, currentlyDirty);
			if (committedKeys.length === 0) {
				continue;
			}
			const engineSessionId = DroxChatSessionUri.parseSessionId(resource);
			if (engineSessionId) {
				await this.sessionChangesPanelService.dismissChanges(
					resource,
					engineSessionId,
					workspacePath,
					committedKeys,
				);
			} else {
				const keySet = new Set(committedKeys);
				const next = events.filter((change, index) => !keySet.has(droxChangeEventKey(change, index)));
				this.sessionChangesDetailService.setSessionChangeEvents(resource, next);
			}
		}
	}


	syncSessionChangesFromDetail(sessionResource: URI): void {
		const session = this._findSessionByResource(sessionResource);
		if (!session) {
			return;
		}
		void this._syncSessionFileChangesSummary(session, true);
	}

	private _sessionFileChangesDiffer(
		before: readonly ISessionFileChange[],
		after: readonly ISessionFileChange[],
	): boolean {
		if (before.length !== after.length) {
			return true;
		}
		for (let i = 0; i < before.length; i++) {
			const a = before[i]!;
			const b = after[i]!;
			if (
				sessionFileChangeUri(a).toString() !== sessionFileChangeUri(b).toString()
				|| a.insertions !== b.insertions
				|| a.deletions !== b.deletions
			) {
				return true;
			}
		}
		return false;
	}

	getSessionMergedFileChanges(sessionResource: URI): readonly ISessionFileChange[] {
		const session = this._findSessionByResource(sessionResource);
		if (session) {
			this._ensureSessionActivated(session);
		}
		return session?.changes.get() ?? [];
	}

	private _ensureGitWatch(session: DroxSession): void {
		const key = session.resource.toString();
		if (this._gitWatchStores.has(key)) {
			return;
		}
		const store = new DisposableStore();
		void this._attachGitRepositoryState(session, store);
		this._gitWatchStores.set(key, store);
		this._register(store);
	}

	private async _attachGitRepositoryState(session: DroxSession, store: DisposableStore): Promise<void> {
		const workspace = session.workspace.get();
		const repoUri = workspace?.folders[0]?.root;
		if (!repoUri) {
			return;
		}

		try {
			const repo = await this.gitService.openRepository(repoUri);
			if (!repo) {
				return;
			}

			const folder = workspace.folders[0];
			const baseGitRepo: ISessionGitRepository = folder.gitRepository ?? {
				uri: folder.root,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable(undefined),
			};

			store.add(autorun(reader => {
				const state = repo.state.read(reader);
				const head = state.HEAD;
				const branchName = head?.commit ? head.name : undefined;
				const upstreamBranchName = head?.upstream
					? `${head.upstream.remote}/${head.upstream.name}`
					: undefined;
				const uncommittedChanges = state.workingTreeChanges.length + state.untrackedChanges.length + state.indexChanges.length;

				const currentWorkspace = session.workspace.read(reader);
				if (!currentWorkspace) {
					return;
				}
				const currentFolder = currentWorkspace.folders[0];
				const currentGit = currentFolder.gitRepository;
				if (
					currentGit?.branchName === branchName
					&& currentGit?.upstreamBranchName === upstreamBranchName
					&& currentGit?.uncommittedChanges === uncommittedChanges
				) {
					return;
				}

				session.updateWorkspace({
					...currentWorkspace,
					folders: [{
						...currentFolder,
						gitRepository: {
							...baseGitRepo,
							branchName,
							upstreamBranchName,
							uncommittedChanges,
						},
					}],
				});
				void this._syncSessionFileChangesSummary(session, true);
			}));
		} catch (e) {
			this.logService.warn('[DroxSessionsProvider] failed to resolve git state', e);
		}
	}

	getSessionWorkspacePath(sessionResource: URI): string | undefined {
		return this._findSessionByResource(sessionResource)?.workspace.get()?.folders[0]?.root.fsPath;
	}

	/** Workspace path for replay I/O — waits for persisted session scan when needed. */
	async ensureSessionWorkspacePath(sessionResource: URI): Promise<string | undefined> {
		const cached = this.getSessionWorkspacePath(sessionResource);
		if (cached) {
			const session = this._findSessionByResource(sessionResource);
			if (session) {
				this._ensureSessionActivated(session);
			}
			return cached;
		}
		await this._loadPersistedSessions(false);
		const path = this.getSessionWorkspacePath(sessionResource);
		const session = this._findSessionByResource(sessionResource);
		if (session) {
			this._ensureSessionActivated(session);
		}
		return path;
	}

	/** Git watch + changes replay — only when a session is actually opened (not for every MRU entry at boot). */
	private _ensureSessionActivated(session: DroxSession): void {
		const key = session.resource.toString();
		if (this._activatedSessionKeys.has(key)) {
			return;
		}
		this._activatedSessionKeys.add(key);
		this._ensureGitWatch(session);
		const engineSessionId = DroxChatSessionUri.parseSessionId(session.resource);
		const workspacePath = session.workspace.get()?.folders[0]?.root.fsPath;
		if (engineSessionId && workspacePath) {
			void this._hydrateSessionChanges(session, engineSessionId, workspacePath);
		}
	}

	private async _hydrateSessionChanges(session: DroxSession, engineSessionId: string, workspacePath: string): Promise<void> {
		try {
			this._trackWorkspaceChangeSession(workspacePath, session.resource);
			const sessionKey = session.resource.toString();
			if (!this._fileChangesHydratedSessions.has(sessionKey)) {
				this._fileChangesHydratedSessions.add(sessionKey);
				const replay = await this.sessionService.readUiReplay(engineSessionId, workspacePath);
				const replayEvents: IDroxFileChangePayload[] = [];
				for (const message of replay) {
					if (message.kind !== 'fileChange' || message.applied === false) {
						continue;
					}
					replayEvents.push(await enrichDroxFileChangeSnapshotAsync(message, workspacePath, this.fileService));
				}
				this.sessionChangesDetailService.mergeSessionChangeEvents(session.resource, replayEvents);
				await this.sessionChangesPanelService.applyPersistedDismissals(session.resource, engineSessionId, workspacePath);
			}
			await this._ensureWorkspaceFileChangesHydrated(workspacePath);
			void this._syncSessionFileChangesSummary(session, true);
			const iSession = this._toISession(session);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
		} catch {
			// ignore missing replay history and keep live changes
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
		const metaTitle = await readDroxSessionMeta(this.fileService, workspacePath, entry.id);
		if (metaTitle?.customTitle) {
			session.setTitle(metaTitle.customTitle);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
			return;
		}
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
		this._ensureGitWatch(session);
		const engineSessionId = DroxChatSessionUri.parseSessionId(session.resource);
		const workspacePath = session.workingDirectory?.fsPath;
		if (engineSessionId && workspacePath) {
			void ensureDroxSessionNotesFile(this.fileService, workspacePath, engineSessionId);
		}
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
		const folder = session.workingDirectory;
		if (folder) {
			this._touchRecentWorkspace(folder);
		}
		const iSession = this._toISession(session);
		this._onDidChangeSessions.fire({ added: [iSession], removed: [], changed: [] });

		try {
			const result = await this._dispatchSend(session, chatResource, options);
			if (result.kind === 'rejected') {
				this._onDidChangeSessions.fire({ added: [], removed: [iSession], changed: [] });
				session.dispose();
				throw new Error(`[DroxSessionsProvider] sendRequest rejected: ${result.reason}`);
			}
			this._commitSessionToCache(session);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
			this._attachSendCompletionHandlers(session, iSession, result);
			return iSession;
		} catch (e) {
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
		const result = await this._dispatchSend(session, chatResource, options);
		if (result.kind === 'rejected') {
			session.setStatus(SessionStatus.Completed);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
			throw new Error(`[DroxSessionsProvider] sendRequest rejected: ${result.reason}`);
		}
		this._attachSendCompletionHandlers(session, iSession, result);
		return iSession;
	}

	private async _dispatchSend(
		session: DroxSession,
		chatResource: URI,
		options: ISendRequestOptions,
	): ReturnType<IChatService['sendRequest']> {
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
		return result;
	}

	private _findSessionByResource(sessionResource: URI): DroxSession | undefined {
		const key = sessionResource.toString();
		const cached = this._sessionCache.get(key);
		if (cached) {
			return cached;
		}
		for (const session of this._newSessions.values()) {
			if (session.resource.toString() === key) {
				return session;
			}
		}
		return undefined;
	}

	private _findSession(sessionId: string): DroxSession | undefined {
		for (const session of this._sessionCache.values()) {
			if (session.sessionId === sessionId) {
				return session;
			}
		}
		return this._newSessions.get(sessionId);
	}

	private _toISession(session: DroxSession): ISession {
		return session;
	}

	async purgeWorkspaceSessions(workspaceFolder: URI): Promise<void> {
		const workspaceKey = workspaceFolder.toString();
		const removed: ISession[] = [];

		for (const session of [...this._sessionCache.values()]) {
			if (session.workingDirectory?.toString() !== workspaceKey) {
				continue;
			}
			await this._evictChatSession(session.resource);
			this.sessionChangesDetailService.clearSession(session.resource);
			this.sessionChangesPanelService.clearSession(session.resource);
			this._sessionCache.delete(session.resource.toString());
			removed.push(this._toISession(session));
			session.dispose();
		}

		for (const session of this._newSessions.values()) {
			if (session.workingDirectory?.toString() !== workspaceKey) {
				continue;
			}
			await this._evictChatSession(session.resource);
			this.sessionChangesDetailService.clearSession(session.resource);
			this.sessionChangesPanelService.clearSession(session.resource);
			this._newSessions.deleteAndDispose(session.sessionId);
			removed.push(this._toISession(session));
		}

		this._persistLoadStarted = false;
		if (removed.length > 0) {
			this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
		}
	}

	private async _evictChatSession(sessionResource: URI): Promise<void> {
		const modelRef = this.chatService.acquireExistingSession(sessionResource, 'DroxSessionsProvider#evictChatSession');
		try {
			await this.chatService.removeHistoryEntry(sessionResource);
		} finally {
			modelRef?.dispose();
		}
	}

	async renameChat(sessionId: string, _chatUri: URI, title: string): Promise<void> {
		await this.renameSession(sessionId, title);
	}

	async renameSession(sessionId: string, title: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (!session) {
			return;
		}
		const trimmed = title.trim();
		if (!trimmed) {
			return;
		}
		session.setTitle(trimmed);
		const engineSessionId = DroxChatSessionUri.parseSessionId(session.resource);
		const workspacePath = session.workingDirectory?.fsPath;
		if (engineSessionId && workspacePath) {
			try {
				await writeDroxSessionMeta(this.fileService, workspacePath, engineSessionId, { customTitle: trimmed });
			} catch (e) {
				this.logService.warn('[DroxSessionsProvider] failed to persist session title', e);
			}
		}
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
	}

	async archiveSession(_sessionId: string): Promise<void> { }

	async unarchiveSession(_sessionId: string): Promise<void> { }

	async deleteSession(sessionId: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (!session) {
			return;
		}

		const key = session.resource.toString();
		const engineSessionId = DroxChatSessionUri.parseSessionId(session.resource);
		const workspacePath = session.workingDirectory?.fsPath;

		await this._evictChatSession(session.resource);
		this.sessionChangesDetailService.clearSession(session.resource);
		this.sessionChangesPanelService.clearSession(session.resource);

		if (engineSessionId && workspacePath) {
			try {
				await this.sessionService.deleteSession(engineSessionId, workspacePath);
			} catch (e) {
				this.logService.warn('[DroxSessionsProvider] failed to delete session on disk', e);
			}
			removeDroxEngineSessionFromRecency(this.storageService, workspacePath, engineSessionId);
		}

		this._gitWatchStores.get(key)?.dispose();
		this._gitWatchStores.delete(key);
		this._activatedSessionKeys.delete(key);
		this._syncGeneration.delete(key);
		this._sessionCache.delete(key);
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}

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
