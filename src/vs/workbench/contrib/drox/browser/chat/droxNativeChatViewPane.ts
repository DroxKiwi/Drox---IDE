/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxIdeNativeChat.css';
import '../agents/media/droxNativeFileChange.css';
import '../discussion/media/droxDiscussionShell.css';
import * as dom from '../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { MutableDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_FOREGROUND } from '../../../../common/theme.js';
import { localize } from '../../../../../nls.js';
import { IChatModelReference, IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatSessionsService } from '../../../chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../chat/common/constants.js';
import { ChatWidget } from '../../../chat/browser/widget/chatWidget.js';
import { IChatViewTitleActionContext } from '../../../chat/common/actions/chatActions.js';
import { DroxChatSessionUri, DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';
import {
	createDroxDiscussionChatWidgetOptions,
	droxIdeNativeChatViewContext,
	pickDroxDiscussionPlaceholder,
} from '../discussion/droxDiscussionChatWidgetOptions.js';
import { resolveDroxNativeChatStartupSessionId, enrichDroxSessionListEntries } from '../../common/droxNativeChatSessionResolver.js';
import { finalizeDroxNativeChatHistoryModel } from '../../common/droxNativeChatHistoryFinalize.js';
import { IDroxSessionListEntry } from '../../common/droxSession.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxChatLayoutStore, DROX_CHAT_LAYOUT_VERSION } from '../droxChatLayoutStore.js';
import { newSessionId } from '../droxChatTabs.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { DroxNativeChatSessionStore } from './droxNativeChatSessionStore.js';
import { DroxAgentSessionsPicker } from './droxAgentSessionsPicker.js';
import {
	DROX_NATIVE_SESSION_LIST_TIMEOUT_MS,
	DROX_NATIVE_WORKSPACE_READY_TIMEOUT_MS,
	DROX_SESSION_LOAD_TIMEOUT_MS,
	DROX_CHAT_PROVIDER_READY_TIMEOUT_MS,
} from '../droxLoadingConstants.js';
import { whenDroxChatContentProviderReady, markDroxChatContentProviderReady } from '../agents/droxAgentsChatActivation.js';
import {
	markDroxEngineSessionOpened,
	readDroxEngineSessionRecency,
	sortDroxSessionEntriesByRecency,
	DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
	DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,
	clearDroxEngineSessionRecency,
	removeDroxEngineSessionFromRecency,
} from '../../common/droxSharedChatSessionHistory.js';
import {
	consumeDroxIdeSessionHandoff,
	DROX_PENDING_IDE_SESSION_HANDOFF_KEY,
} from '../../common/droxIdeSessionHandoff.js';
import {
	createDroxIdeSessionHistoryGroup,
	pruneDroxIdeSessionHistoryGroups,
	removeSessionsFromDroxIdeHistoryGroups,
} from '../../common/droxIdeSessionHistoryGroups.js';

export class DroxNativeChatViewPane extends ViewPane {

	private _widget: ChatWidget | undefined;
	private _scopedContextKeyService: IContextKeyService | undefined;
	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());
	private readonly _sessionStore: DroxNativeChatSessionStore;
	private readonly _layoutStore: DroxChatLayoutStore;
	private _engineSessionId: string | undefined;

	/** Active engine session id (`ses_*`) for the native chat pane, if any. */
	get engineSessionId(): string | undefined {
		return this._engineSessionId;
	}
	private _sessionEntries: readonly IDroxSessionListEntry[] = [];
	/** True once we opened a session after a resolved workspace path (or timed out). */
	private _startupSessionResolved = false;
	private _awaitingWorkspaceForStartup = false;
	private _startupSessionInFlight: Promise<void> | undefined;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IDroxChatSessionService private readonly chatSessionService: IDroxChatSessionService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._sessionStore = instantiationService.createInstance(DroxNativeChatSessionStore);
		this._layoutStore = new DroxChatLayoutStore(this.storageService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('drox-ide-native-chat');
		document.body.classList.add('drox-ide-native-chat-active');

		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, this._scopedContextKeyService]),
		));

		const locationBasedColors = this.getLocationBasedColors();
		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			droxIdeNativeChatViewContext(),
			createDroxDiscussionChatWidgetOptions('ide'),
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: locationBasedColors.background,
				overlayBackground: locationBasedColors.overlayBackground,
				inputEditorBackground: locationBasedColors.background,
				resultEditorBackground: editorBackground,
			},
		));

		const chatRoot = dom.append(container, dom.$('.drox-ide-native-chat-widget'));
		chatRoot.classList.add('drox-discussion-shell');
		this._widget.render(chatRoot);
		this._register(this.onDidChangeBodyVisibility(visible => {
			this._widget?.setVisible(visible);
		}));
		this._widget.setVisible(this.isBodyVisible());

		const storageListenerStore = this._register(new DisposableStore());
		this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, storageListenerStore)(() => {
			void this._onSharedRecencyStorageChanged();
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, storageListenerStore)(() => {
			void this._onSharedRecencyStorageChanged();
		}));
		// Agents → IDE handoff while this window is already open.
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, DROX_PENDING_IDE_SESSION_HANDOFF_KEY, storageListenerStore)(() => {
			void this._onPendingIdeSessionHandoff();
		}));

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			if (this._awaitingWorkspaceForStartup || !this._startupSessionResolved) {
				void this._openStartupSession();
			}
		}));

		void this._openStartupSession();
	}

	override dispose(): void {
		document.body.classList.remove('drox-ide-native-chat-active');
		super.dispose();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget?.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this._widget?.focusInput();
	}

	override getActionsContext(): IChatViewTitleActionContext | undefined {
		if (!this._engineSessionId) {
			return undefined;
		}
		return {
			sessionResource: DroxChatSessionUri.forSession(this._engineSessionId),
			$mid: MarshalledId.ChatViewContext,
		};
	}

	async pickSession(): Promise<void> {
		if (this.chatSessionService.getRunId()) {
			this.notificationService.warn(localize('drox.nativeChat.busy', 'Stop the current run before switching sessions.'));
			return;
		}
		await this._refreshSessionList();
		if (this._sessionEntries.length === 0) {
			this.notificationService.info(localize('drox.nativeChat.noSessions', 'No saved sessions in this workspace yet.'));
			return;
		}
		const ws = this._workspacePath();
		if (!ws) {
			this.notificationService.warn(localize('drox.nativeChat.noWorkspace', 'No workspace folder is open.'));
			return;
		}

		const known = new Set(this._sessionEntries.map(e => e.id));
		const historyGroups = pruneDroxIdeSessionHistoryGroups(this.storageService, known);
		const picker = this.instantiationService.createInstance(DroxAgentSessionsPicker);
		await picker.pickSession(
			this._sessionEntries,
			async sessionId => { await this._openDroxSession(sessionId); },
			{
				historyGroups,
				onDelete: async sessionIds => {
					await this._deleteWorkspaceSessions(ws, sessionIds);
				},
				onGroup: async sessionIds => {
					const result = await this.quickInputService.input({
						title: localize('drox.nativeChat.groupTitle', 'New session group'),
						placeHolder: localize('drox.nativeChat.groupPlaceholder', 'Group name'),
						value: localize('drox.nativeChat.groupDefault', 'Group'),
					});
					const name = result?.trim();
					if (!name) {
						return;
					}
					createDroxIdeSessionHistoryGroup(this.storageService, name, sessionIds);
					this.notificationService.info(localize(
						'drox.nativeChat.groupCreated',
						'Grouped {0} sessions as “{1}”.',
						sessionIds.length,
						name,
					));
				},
			},
		);
	}

	private async _deleteWorkspaceSessions(workspaceFsPath: string, sessionIds: readonly string[]): Promise<void> {
		const unique = [...new Set(sessionIds.filter(Boolean))];
		if (unique.length === 0) {
			return;
		}
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: unique.length === 1
				? localize('drox.nativeChat.deleteOne.title', 'Delete this chat session?')
				: localize('drox.nativeChat.deleteMany.title', 'Delete {0} chat sessions?', unique.length),
			detail: localize('drox.nativeChat.delete.detail', 'This permanently removes the session files from `.drox/sessions`.'),
			primaryButton: localize({ key: 'drox.nativeChat.delete.confirm', comment: ['&& denotes a mnemonic'] }, '&&Delete'),
		});
		if (!confirmed) {
			return;
		}

		const errors: string[] = [];
		for (const id of unique) {
			try {
				await this.sessionService.deleteSession(id, workspaceFsPath);
				removeDroxEngineSessionFromRecency(this.storageService, workspaceFsPath, id);
			} catch (e) {
				errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		removeSessionsFromDroxIdeHistoryGroups(this.storageService, unique);
		await this._refreshSessionList();

		if (this._engineSessionId && unique.includes(this._engineSessionId)) {
			await this._openDroxSession(newSessionId());
		}

		if (errors.length > 0) {
			this.notificationService.error(localize(
				'drox.nativeChat.delete.failed',
				'Failed to delete some sessions: {0}',
				errors.join('; '),
			));
		}
	}

	async startNewChat(): Promise<void> {
		if (this.chatSessionService.getRunId()) {
			this.notificationService.warn(localize('drox.nativeChat.busy', 'Stop the current run before starting a new chat.'));
			return;
		}
		await this._openDroxSession(newSessionId());
	}

	async resetWorkspaceDroxData(): Promise<void> {
		if (this.chatSessionService.getRunId()) {
			this.notificationService.warn(localize('drox.nativeChat.busy.reset', 'Stop the current run before resetting workspace Drox data.'));
			return;
		}

		const ws = this._workspacePath();
		if (!ws) {
			this.notificationService.warn(localize('drox.nativeChat.noWorkspace', 'No workspace folder is open.'));
			return;
		}

		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('drox.nativeChat.reset.title', 'Reset Drox data for this workspace?'),
			detail: localize(
				'drox.nativeChat.reset.detail',
				'Permanently deletes:\n• all of `.drox/` (sessions, memory, attachments, …)\n• `MEMORY.md` at the workspace root\n\nKept: `.drox/.env` only.',
			),
			primaryButton: localize({ key: 'drox.nativeChat.reset.confirm', comment: ['&& denotes a mnemonic'] }, '&&Reset'),
			cancelButton: localize('drox.nativeChat.reset.cancel', 'Cancel'),
		});
		if (!confirmed) {
			return;
		}

		try {
			await this.sessionService.resetWorkspace(ws);
			clearDroxEngineSessionRecency(this.storageService, ws);
			await this._openDroxSession(newSessionId());
			await this._refreshSessionList();
			this.notificationService.info(localize(
				'drox.nativeChat.reset.done',
				'Workspace Drox data reset: `.drox/sessions`, project memory (`MEMORY.md`), workspace map, long memory, attachments, and professor cycles removed.',
			));
		} catch (e) {
			this.notificationService.error(localize(
				'drox.nativeChat.reset.failed',
				'Failed to reset workspace Drox data: {0}',
				e instanceof Error ? e.message : String(e),
			));
		}
	}

	prefillPrompt(text: string, replace = false): void {
		const trimmed = text.trim();
		if (!trimmed || !this._widget) {
			return;
		}
		if (replace) {
			this._widget.setInput(trimmed);
		} else {
			const current = this._widget.getInput().trim();
			this._widget.setInput(current ? `${current}\n\n${trimmed}` : trimmed);
		}
		this._widget.focusInput();
	}

	private _workspacePath(): string | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}

	private async _waitForWorkspacePath(timeoutMs: number): Promise<string | undefined> {
		const existing = this._workspacePath();
		if (existing) {
			return existing;
		}
		this._awaitingWorkspaceForStartup = true;
		try {
			return await new Promise<string | undefined>(resolve => {
				const timer = setTimeout(() => {
					listener.dispose();
					resolve(this._workspacePath());
				}, timeoutMs);
				const listener = this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
					const ws = this._workspacePath();
					if (ws) {
						clearTimeout(timer);
						listener.dispose();
						resolve(ws);
					}
				});
			});
		} finally {
			this._awaitingWorkspaceForStartup = false;
		}
	}

	private async _openStartupSession(): Promise<void> {
		if (this._startupSessionInFlight) {
			return this._startupSessionInFlight;
		}
		this._startupSessionInFlight = this._doOpenStartupSession().finally(() => {
			this._startupSessionInFlight = undefined;
		});
		return this._startupSessionInFlight;
	}

	private async _doOpenStartupSession(): Promise<void> {
		const t0 = Date.now();

		// Empty-first: attach a blank session immediately so the composer is usable
		// before workspace / session.list / handoff work finishes.
		const blankId = newSessionId();
		this.logService.info(`[Drox IDE native chat] empty-first blank=${blankId} (+0ms)`);
		const blankOk = await this._openDroxSession(blankId, {
			markOpened: false,
			allowBlankFallback: false,
			showTimeoutToast: false,
		});

		void this._resolveAndHydratePreferred(blankId, blankOk, t0);
	}

	/** Resolve handoff / MRU after blank paint, then swap if still appropriate. */
	private async _resolveAndHydratePreferred(blankId: string, blankOk: boolean, t0: number): Promise<void> {
		let ws = this._workspacePath();
		if (!ws) {
			ws = await this._waitForWorkspacePath(DROX_NATIVE_WORKSPACE_READY_TIMEOUT_MS);
		}

		let preferredId: string | undefined;

		if (!ws) {
			// Do not mark MRU — a later folder handoff can still resume the real last session.
			this._startupSessionResolved = false;
			if (blankOk) {
				// Keep blank without writing MRU until a folder is known.
				return;
			}
			if (!this._modelRef.value) {
				this.notificationService.warn(localize(
					'drox.nativeChat.loadTimeout',
					'Timed out loading the chat session. Try New Chat or reopen the panel.',
				));
			}
			return;
		}

		const handoffSessionId = consumeDroxIdeSessionHandoff(this.storageService, ws);
		if (handoffSessionId) {
			this.logService.info(
				`[Drox IDE native chat] handoff sessionId=${handoffSessionId} (+${Date.now() - t0}ms)`,
			);
			preferredId = handoffSessionId;
			void this._refreshSessionList();
		} else {
			try {
				this.logService.info(`[Drox IDE native chat] resolve startup (+${Date.now() - t0}ms)`);
				const listPromise = resolveDroxNativeChatStartupSessionId({
					workspaceFsPath: ws,
					sessionService: this.sessionService,
					persistedNativeSessionId: this._sessionStore.getActiveSessionId(),
					webviewActiveTabId: this._layoutStore.load()?.activeTabId,
					recencySessionIds: readDroxEngineSessionRecency(this.storageService, ws),
					createNewSessionId: newSessionId,
				});
				const resolved = await raceTimeout(
					listPromise,
					DROX_NATIVE_SESSION_LIST_TIMEOUT_MS,
					() => this.logService.warn(
						`[Drox IDE native chat] session.list timed out after ${DROX_NATIVE_SESSION_LIST_TIMEOUT_MS}ms — using persisted session id`,
					),
				);
				if (resolved) {
					this._sessionEntries = resolved.entries;
					preferredId = resolved.sessionId;
					const wsPath = this._workspacePath();
					if (wsPath && resolved.entries.some(e => !e.title?.trim())) {
						void enrichDroxSessionListEntries(this.sessionService, wsPath, resolved.entries).then(entries => {
							this._sessionEntries = entries;
						}, err => this.logService.warn('[Drox IDE native chat] session title enrich failed', err));
					}
				} else {
					preferredId = this._sessionStore.getActiveSessionId()
						?? this._layoutStore.load()?.activeTabId
						?? readDroxEngineSessionRecency(this.storageService, ws)[0]
						?? undefined;
				}
			} catch (e) {
				this.logService.error('[Drox IDE native chat] failed to resolve startup session', e);
				preferredId = undefined;
			}
		}

		this._startupSessionResolved = true;

		if (preferredId && preferredId !== blankId) {
			await this._hydratePreferredSession(preferredId, t0);
			return;
		}

		// No preferred (or same as blank): mark the blank as the active session now.
		if (blankOk && this._engineSessionId === blankId) {
			this._sessionStore.setActiveSessionId(blankId);
			markDroxEngineSessionOpened(this.storageService, ws, blankId);
			this._persistNativeLayout(blankId);
		} else if (!blankOk && !this._modelRef.value) {
			this.notificationService.warn(localize(
				'drox.nativeChat.loadTimeout',
				'Timed out loading the chat session. Try New Chat or reopen the panel.',
			));
		}
	}

	/** Background swap to handoff / MRU session once the content provider is ready. */
	private async _hydratePreferredSession(sessionId: string, t0: number): Promise<void> {
		this.logService.info(
			`[Drox IDE native chat] hydrate preferred sessionId=${sessionId} (+${Date.now() - t0}ms)`,
		);
		// Don't steal text the user already typed into the blank composer.
		if (this._widget?.getInput().trim()) {
			this.logService.info('[Drox IDE native chat] skip hydrate — composer has draft input');
			return;
		}
		const ok = await this._openDroxSession(sessionId, {
			markOpened: true,
			allowBlankFallback: false,
			showTimeoutToast: false,
		});
		if (!ok) {
			this.logService.warn(
				`[Drox IDE native chat] preferred hydrate failed; keeping blank (+${Date.now() - t0}ms)`,
			);
			// Promote blank to MRU so the next launch has something sensible.
			const blankId = this._engineSessionId;
			const ws = this._workspacePath();
			if (blankId && ws) {
				this._sessionStore.setActiveSessionId(blankId);
				markDroxEngineSessionOpened(this.storageService, ws, blankId);
				this._persistNativeLayout(blankId);
			}
		}
	}

	private async _onPendingIdeSessionHandoff(): Promise<void> {
		const ws = this._workspacePath();
		if (!ws || !this._widget) {
			return;
		}
		const sessionId = consumeDroxIdeSessionHandoff(this.storageService, ws);
		if (!sessionId) {
			return;
		}
		this.logService.info(`[Drox IDE native chat] handoff (live) sessionId=${sessionId}`);
		if (this._widget.getInput().trim()) {
			this.logService.info('[Drox IDE native chat] skip live handoff — composer has draft input');
			return;
		}
		await this._openDroxSession(sessionId, { showTimeoutToast: false });
	}

	private _persistNativeLayout(engineSessionId: string): void {
		const snap = this._layoutStore.load();
		const tabs = snap?.tabs.slice() ?? [];
		if (!tabs.some(t => t.sessionId === engineSessionId)) {
			tabs.push({ sessionId: engineSessionId });
		}
		this._layoutStore.save({
			version: DROX_CHAT_LAYOUT_VERSION,
			tabs,
			activeTabId: engineSessionId,
		});
	}

	private _openSessionChain: Promise<unknown> = Promise.resolve();

	/**
	 * @returns true when a chat model was attached for `engineSessionId`.
	 */
	private async _openDroxSession(
		engineSessionId: string,
		opts?: {
			readonly markOpened?: boolean;
			readonly allowBlankFallback?: boolean;
			readonly showTimeoutToast?: boolean;
		},
	): Promise<boolean> {
		// Serialize opens — parallel acquire+cancel storms poison the chat service.
		const run = this._openSessionChain.then(() => this._openDroxSessionSerialized(engineSessionId, opts));
		this._openSessionChain = run.then(() => undefined, () => undefined);
		return run;
	}

	private async _openDroxSessionSerialized(
		engineSessionId: string,
		opts?: {
			readonly markOpened?: boolean;
			readonly allowBlankFallback?: boolean;
			readonly showTimeoutToast?: boolean;
		},
	): Promise<boolean> {
		if (!this._widget) {
			return false;
		}
		if (this.chatSessionService.getRunId()) {
			this.notificationService.warn(localize('drox.nativeChat.busy', 'Stop the current run before switching sessions.'));
			return false;
		}

		const t0 = Date.now();
		const markOpened = opts?.markOpened !== false;
		// Default OFF — empty-first already paints a blank; cascading soft-fail causes toast storms.
		const allowBlankFallback = opts?.allowBlankFallback === true;
		const showTimeoutToast = opts?.showTimeoutToast !== false;
		const sessionResource = DroxChatSessionUri.forSession(engineSessionId);
		try {
			const schemes = this.chatSessionsService.getContentProviderSchemes();
			if (schemes.includes(DROX_CHAT_SESSION_TYPE)) {
				markDroxChatContentProviderReady();
			}
			const providerReady = await whenDroxChatContentProviderReady(DROX_CHAT_PROVIDER_READY_TIMEOUT_MS);
			if (!providerReady && !this.chatSessionsService.getContentProviderSchemes().includes(DROX_CHAT_SESSION_TYPE)) {
				this.logService.warn(
					`[Drox IDE native chat] content provider not ready after ${DROX_CHAT_PROVIDER_READY_TIMEOUT_MS}ms sessionId=${engineSessionId}`,
				);
			} else {
				markDroxChatContentProviderReady();
				this.logService.info(
					`[Drox IDE native chat] provider ready (+${Date.now() - t0}ms) sessionId=${engineSessionId}`,
				);
			}

			const cts = new CancellationTokenSource();
			this.logService.info(
				`[Drox IDE native chat] acquire sessionId=${engineSessionId} (+${Date.now() - t0}ms)`,
			);
			const loadPromise = this.chatService.acquireOrLoadSession(
				sessionResource,
				ChatAgentLocation.Chat,
				cts.token,
				'DroxNativeChatViewPane#openSession',
			).catch(err => {
				this.logService.warn(
					`[Drox IDE native chat] acquire rejected sessionId=${engineSessionId}: ${err instanceof Error ? err.message : String(err)}`,
				);
				return undefined;
			});
			const ref = await raceTimeout(
				loadPromise,
				DROX_SESSION_LOAD_TIMEOUT_MS,
				() => {
					cts.cancel();
					this.logService.error(
						`[Drox IDE native chat] session load timed out after ${DROX_SESSION_LOAD_TIMEOUT_MS}ms sessionId=${engineSessionId}`,
					);
				},
			);
			cts.dispose();
			if (!ref) {
				if (allowBlankFallback) {
					this.logService.warn(
						`[Drox IDE native chat] soft-fail → blank session after failed load sessionId=${engineSessionId}`,
					);
					return this._openDroxSessionSerialized(newSessionId(), {
						markOpened,
						allowBlankFallback: false,
						showTimeoutToast,
					});
				}
				if (showTimeoutToast && !this._modelRef.value) {
					this.notificationService.warn(localize(
						'drox.nativeChat.loadTimeout',
						'Timed out loading the chat session. Try New Chat or reopen the panel.',
					));
				}
				return false;
			}
			this._engineSessionId = engineSessionId;
			if (markOpened) {
				this._sessionStore.setActiveSessionId(engineSessionId);
				const ws = this._workspacePath();
				if (ws) {
					markDroxEngineSessionOpened(this.storageService, ws, engineSessionId);
				}
				this._persistNativeLayout(engineSessionId);
			}
			this.chatSessionService.setSessionId(engineSessionId);
			this._modelRef.value = ref;
			finalizeDroxNativeChatHistoryModel(ref.object);
			this._widget.setModel(ref.object);
			this._bindDroxNativeSession(ref.object);
			this._widget.setInputPlaceholder(pickDroxDiscussionPlaceholder());
			this.updateActions();
			this.logService.info(
				`[Drox IDE native chat] setModel sessionId=${engineSessionId} (+${Date.now() - t0}ms)`,
			);
			return true;
		} catch (e) {
			this.logService.error('[Drox IDE native chat] failed to open session', e);
			if (allowBlankFallback) {
				return this._openDroxSessionSerialized(newSessionId(), {
					markOpened,
					allowBlankFallback: false,
					showTimeoutToast,
				});
			}
			return !!this._modelRef.value;
		}
	}

	private _bindDroxNativeSession(model: IChatModel): void {
		if (!this._widget) {
			return;
		}
		const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0]?.uri;
		if (workspaceFolder) {
			model.setWorkingDirectory(workspaceFolder);
		}
		const contribution = this.chatSessionsService.getChatSessionContribution(DROX_CHAT_SESSION_TYPE);
		if (contribution) {
			this._widget.lockToCodingAgent(
				contribution.name,
				contribution.displayName,
				DROX_CHAT_SESSION_TYPE,
				contribution.agentHostProviderId,
			);
		}
		this._widget.input.setChatMode(ChatModeKind.Agent);
	}

	private async _refreshSessionList(): Promise<void> {
		const ws = this._workspacePath();
		if (!ws) {
			this._sessionEntries = [];
			return;
		}
		const entries = await this.sessionService.listSessions(ws);
		const recency = readDroxEngineSessionRecency(this.storageService, ws);
		const sorted = sortDroxSessionEntriesByRecency(entries, recency);
		this._sessionEntries = await enrichDroxSessionListEntries(this.sessionService, ws, sorted);
	}

	private async _onSharedRecencyStorageChanged(): Promise<void> {
		await this._refreshSessionList();
	}
}
