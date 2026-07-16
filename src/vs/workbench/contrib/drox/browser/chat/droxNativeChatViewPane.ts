/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxIdeNativeChat.css';
import '../agents/media/droxNativeFileChange.css';
import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
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
import { resolveDroxNativeChatStartupSessionId, enrichDroxSessionListEntries } from '../../common/droxNativeChatSessionResolver.js';
import { finalizeDroxNativeChatHistoryModel } from '../../common/droxNativeChatHistoryFinalize.js';
import { IDroxSessionListEntry } from '../../common/droxSession.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxChatLayoutStore } from '../droxChatLayoutStore.js';
import { newSessionId } from '../droxChatTabs.js';
import { DroxViews } from '../../common/drox.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { DroxNativeChatSessionStore } from './droxNativeChatSessionStore.js';
import { DroxAgentSessionsPicker } from './droxAgentSessionsPicker.js';
import { DroxSessionLoadingOverlay } from '../droxSessionLoadingOverlay.js';
import {
	markDroxEngineSessionOpened,
	readDroxEngineSessionRecency,
	sortDroxSessionEntriesByRecency,
	DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,
	DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,
	clearDroxEngineSessionRecency,
} from '../../common/droxSharedChatSessionHistory.js';

export class DroxNativeChatViewPane extends ViewPane {

	private _widget: ChatWidget | undefined;
	private _scopedContextKeyService: IContextKeyService | undefined;
	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());
	private readonly _sessionStore: DroxNativeChatSessionStore;
	private readonly _layoutStore: DroxChatLayoutStore;
	private _engineSessionId: string | undefined;
	private _sessionEntries: readonly IDroxSessionListEntry[] = [];
	private _sessionLoadingOverlay: DroxSessionLoadingOverlay | undefined;

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
			{ viewId: DroxViews.NativeChatViewId },
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: true,
				supportsFileReferences: true,
				rendererOptions: {
					renderTextEditsAsSummary: () => true,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: false,
				droxNativeComposer: true,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: locationBasedColors.background,
				overlayBackground: locationBasedColors.overlayBackground,
				inputEditorBackground: locationBasedColors.background,
				resultEditorBackground: editorBackground,
			},
		));

		const chatRoot = dom.append(container, dom.$('.drox-ide-native-chat-widget'));
		this._sessionLoadingOverlay = this._register(new DroxSessionLoadingOverlay(chatRoot));
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
		const picker = this.instantiationService.createInstance(DroxAgentSessionsPicker);
		await picker.pickSession(this._sessionEntries, sessionId => this._openDroxSession(sessionId));
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

	private async _openStartupSession(): Promise<void> {
		const ws = this._workspacePath();
		if (!ws) {
			await this._openDroxSession(newSessionId());
			return;
		}
		try {
			const resolved = await resolveDroxNativeChatStartupSessionId({
				workspaceFsPath: ws,
				sessionService: this.sessionService,
				persistedNativeSessionId: this._sessionStore.getActiveSessionId(),
				webviewActiveTabId: this._layoutStore.load()?.activeTabId,
				recencySessionIds: readDroxEngineSessionRecency(this.storageService, ws),
				createNewSessionId: newSessionId,
			});
			this._sessionEntries = resolved.entries;
			const wsPath = this._workspacePath();
			if (wsPath) {
				this._sessionEntries = await enrichDroxSessionListEntries(this.sessionService, wsPath, resolved.entries);
			}
			await this._openDroxSession(resolved.sessionId);
		} catch (e) {
			this.logService.error('[Drox IDE native chat] failed to resolve startup session', e);
			await this._openDroxSession(newSessionId());
		}
	}

	private async _openDroxSession(engineSessionId: string): Promise<void> {
		if (!this._widget) {
			return;
		}
		if (this.chatSessionService.getRunId()) {
			this.notificationService.warn(localize('drox.nativeChat.busy', 'Stop the current run before switching sessions.'));
			return;
		}

		const sessionResource = DroxChatSessionUri.forSession(engineSessionId);
		try {
			this._modelRef.clear();
			const loadPromise = this.chatService.acquireOrLoadSession(
				sessionResource,
				ChatAgentLocation.Chat,
				CancellationToken.None,
				'DroxNativeChatViewPane#openSession',
			);
			const ref = this._sessionLoadingOverlay
				? await this._sessionLoadingOverlay.showWhile(loadPromise)
				: await loadPromise;
			if (!ref) {
				return;
			}
			this._engineSessionId = engineSessionId;
			this._sessionStore.setActiveSessionId(engineSessionId);
			const ws = this._workspacePath();
			if (ws) {
				markDroxEngineSessionOpened(this.storageService, ws, engineSessionId);
			}
			this.chatSessionService.setSessionId(engineSessionId);
			this._modelRef.value = ref;
			finalizeDroxNativeChatHistoryModel(ref.object);
			this._widget.setModel(ref.object);
			this._bindDroxNativeSession(ref.object);
			this.updateActions();
		} catch (e) {
			this.logService.error('[Drox IDE native chat] failed to open session', e);
			this._widget.setModel(undefined);
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
