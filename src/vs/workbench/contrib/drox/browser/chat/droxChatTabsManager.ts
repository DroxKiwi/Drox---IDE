/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { deriveTitleFromTranscriptMessages, IDroxTranscriptMessage } from '../../common/droxSession.js';
import { deriveSessionTabTitle } from '../../common/droxUserPromptSticky.js';
import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxChatAgentDoneHost } from '../droxChatAgentEvents.js';
import { DroxChatLayoutStore, DROX_CHAT_LAYOUT_VERSION } from '../droxChatLayoutStore.js';
import { emptyTabUiStats, IDroxChatTab, newSessionId } from '../droxChatTabs.js';
import { replayTranscriptMessages, replayUiJournalMessages } from '../droxSessionReplay.js';

const DEFAULT_TAB_TITLE = localize('droxChatSessionNew', 'New chat');

export interface IDroxChatTabsDelegate {
	post(message: DroxHostToWebviewMessage): void;
	/** Désactive l’enregistrement du journal UI pendant le rejeu d’une session. */
	setUiReplayRecordingEnabled(enabled: boolean): void;
	getCurrentRunId(): string | undefined;
	clearCurrentRunId(): void;
	syncChatSessionState(): void;
	resolveUserAskSkipped(): void;
	clearPendingTools(): void;
	agentEventHost(): IDroxChatAgentDoneHost;
}

export class DroxChatTabsManager {
	readonly openTabs: IDroxChatTab[] = [];
	currentSessionId?: string;
	private layoutWorkspaceId?: string;

	constructor(
		private readonly delegate: IDroxChatTabsDelegate,
		private readonly layoutStore: DroxChatLayoutStore,
		private readonly workspaceContextService: IWorkspaceContextService,
		private readonly sessionService: IDroxSessionService,
		private readonly chatSessionService: IDroxChatSessionService,
	) { }

	getActiveTab(): IDroxChatTab | undefined {
		if (!this.currentSessionId) {
			return undefined;
		}
		return this.openTabs.find(t => t.sessionId === this.currentSessionId);
	}

	private getWorkspaceFsPath(): string | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}

	/** `unchanged` = onglets déjà chargés pour ce workspace. */
	async ensureTabsReady(): Promise<'restored' | 'initial' | 'unchanged'> {
		const wsId = this.workspaceContextService.getWorkspace().id;
		if (this.layoutWorkspaceId === wsId && this.openTabs.length > 0) {
			return 'unchanged';
		}
		this.layoutWorkspaceId = wsId;
		this.openTabs.length = 0;
		this.currentSessionId = undefined;
		this.delegate.syncChatSessionState();
		if (await this.tryRestoreChatLayout()) {
			return 'restored';
		}
		this.ensureInitialTab();
		return 'initial';
	}

	async reloadTabsForWorkspace(webviewReady: boolean, currentRunId: string | undefined): Promise<void> {
		if (currentRunId || !webviewReady) {
			return;
		}
		this.layoutWorkspaceId = undefined;
		const mode = await this.ensureTabsReady();
		if (mode === 'unchanged') {
			return;
		}
		if (mode === 'initial' && this.currentSessionId) {
			await this.activateChatTab(this.currentSessionId, { loadMessages: false });
			return;
		}
		this.postTabs();
		if (this.currentSessionId) {
			const tab = this.getActiveTab();
			this.delegate.post({
				kind: 'session',
				id: this.currentSessionId,
				uiStats: tab?.uiStats,
			});
		}
	}

	private async tryRestoreChatLayout(): Promise<boolean> {
		const snap = this.layoutStore.load();
		if (!snap) {
			return false;
		}
		for (const t of snap.tabs) {
			this.openTabs.push({
				sessionId: t.sessionId,
				title: (t.title && t.title.trim()) ? t.title.trim() : DEFAULT_TAB_TITLE,
				titleFromModel: Boolean(t.titleFromModel),
				uiStats: t.uiStats
					? {
						totalIn: t.uiStats.totalIn,
						totalOut: t.uiStats.totalOut,
						ctx: t.uiStats.ctx,
					}
					: emptyTabUiStats(),
			});
		}
		let activeId = snap.activeTabId;
		if (!activeId || !this.openTabs.some(tab => tab.sessionId === activeId)) {
			activeId = this.openTabs[0]?.sessionId;
		}
		if (!activeId) {
			this.openTabs.length = 0;
			return false;
		}
		await this.activateChatTab(activeId, { loadMessages: true });
		return true;
	}

	private persistChatLayout(): void {
		if (this.openTabs.length === 0) {
			this.layoutStore.clear();
			return;
		}
		this.layoutStore.save({
			version: DROX_CHAT_LAYOUT_VERSION,
			tabs: this.openTabs.map(t => ({
				sessionId: t.sessionId,
				title: t.title,
				titleFromModel: t.titleFromModel,
				uiStats: { ...t.uiStats },
			})),
			activeTabId: this.currentSessionId ?? null,
		});
	}

	postTabs(): void {
		this.persistChatLayout();
		this.delegate.post({
			kind: 'tabs',
			tabs: this.openTabs.map(t => ({ id: t.sessionId, title: t.title })),
			activeId: this.currentSessionId ?? null,
		});
	}

	setTabTitleFromUserPrompt(sessionId: string | undefined, text: string): void {
		if (!sessionId) {
			return;
		}
		const tab = this.openTabs.find(t => t.sessionId === sessionId);
		if (!tab || tab.titleFromModel) {
			return;
		}
		if (tab.title !== DEFAULT_TAB_TITLE) {
			return;
		}
		const title = deriveSessionTabTitle(text);
		if (!title) {
			return;
		}
		tab.title = title;
		this.postTabs();
	}

	private applyTabTitleFromTranscript(tab: IDroxChatTab, messages: readonly IDroxTranscriptMessage[]): void {
		if (tab.titleFromModel || tab.title !== DEFAULT_TAB_TITLE) {
			return;
		}
		const title = deriveTitleFromTranscriptMessages(messages);
		if (!title) {
			return;
		}
		tab.title = title;
	}

	setTabTitleFromModel(sessionId: string | undefined, text: string): void {
		if (!sessionId) {
			return;
		}
		const tab = this.openTabs.find(t => t.sessionId === sessionId);
		if (!tab) {
			return;
		}
		const title = deriveSessionTabTitle(text);
		if (!title) {
			return;
		}
		tab.title = title;
		tab.titleFromModel = true;
		this.postTabs();
	}

	trackUsageForActiveTab(inputTokens: number, outputTokens: number): void {
		const tab = this.getActiveTab();
		if (!tab) {
			return;
		}
		if (inputTokens > 0) {
			tab.uiStats.totalIn += inputTokens;
		}
		if (outputTokens > 0) {
			tab.uiStats.totalOut += outputTokens;
		}
	}

	trackContextForActiveTab(tokensUsed: number): void {
		const tab = this.getActiveTab();
		if (!tab) {
			return;
		}
		tab.uiStats.ctx = tokensUsed;
	}

	openNewChatTab(): void {
		if (this.delegate.getCurrentRunId()) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.sessions.busy', 'Stop the current run before loading a session.'),
			});
			return;
		}
		const id = newSessionId();
		this.openTabs.push({
			sessionId: id,
			title: DEFAULT_TAB_TITLE,
			titleFromModel: false,
			uiStats: emptyTabUiStats(),
		});
		void this.activateChatTab(id, { loadMessages: false });
	}

	async switchChatTab(sessionId: string): Promise<void> {
		if (!sessionId.startsWith('ses_')) {
			return;
		}
		if (sessionId === this.currentSessionId) {
			return;
		}
		if (!this.openTabs.some(t => t.sessionId === sessionId)) {
			return;
		}
		await this.activateChatTab(sessionId, { loadMessages: true });
	}

	async closeChatTab(sessionId: string): Promise<void> {
		if (!sessionId.startsWith('ses_')) {
			return;
		}
		if (this.delegate.getCurrentRunId() && sessionId === this.currentSessionId) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.sessions.busy', 'Stop the current run before loading a session.'),
			});
			return;
		}
		const idx = this.openTabs.findIndex(t => t.sessionId === sessionId);
		if (idx < 0) {
			return;
		}
		this.openTabs.splice(idx, 1);
		if (this.currentSessionId !== sessionId) {
			this.postTabs();
			return;
		}
		const next = this.openTabs[idx] ?? this.openTabs[idx - 1];
		if (next) {
			await this.activateChatTab(next.sessionId, { loadMessages: true });
		} else {
			this.ensureInitialTab();
			await this.activateChatTab(this.currentSessionId!, { loadMessages: false });
		}
	}

	async activateChatTab(sessionId: string, opts: { loadMessages: boolean }): Promise<void> {
		if (this.delegate.getCurrentRunId()) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.sessions.busy', 'Stop the current run before loading a session.'),
			});
			return;
		}
		const tab = this.openTabs.find(t => t.sessionId === sessionId);
		if (!tab) {
			return;
		}
		this.delegate.resolveUserAskSkipped();
		this.currentSessionId = sessionId;
		this.delegate.clearCurrentRunId();
		this.chatSessionService.setPendingSessionReset(false);
		this.delegate.syncChatSessionState();
		this.delegate.clearPendingTools();
		this.postTabs();
		this.delegate.post({ kind: 'chatReset' });
		this.delegate.post({
			kind: 'session',
			id: sessionId,
			uiStats: { ...tab.uiStats },
		});
		this.delegate.post({ kind: 'state', busy: false });
		if (!opts.loadMessages) {
			return;
		}
		try {
			const ws = this.getWorkspaceFsPath();
			if (!ws) {
				this.delegate.post({
					kind: 'append',
					role: 'error',
					text: localize('drox.workspace.none', 'No workspace folder open.'),
				});
				return;
			}
			const read = await this.sessionService.readSession(sessionId, ws);
			this.applyTabTitleFromTranscript(tab, read.messages);
			this.postTabs();
			if (read.uiStats) {
				tab.uiStats = {
					totalIn: read.uiStats.totalIn,
					totalOut: read.uiStats.totalOut,
					ctx: read.uiStats.ctx,
				};
				this.delegate.post({
					kind: 'session',
					id: sessionId,
					uiStats: { ...tab.uiStats },
				});
			}
			this.delegate.setUiReplayRecordingEnabled(false);
			try {
				const uiReplay = await this.sessionService.readUiReplay(sessionId, ws);
				if (uiReplay.length > 0) {
					this.delegate.post({
						kind: 'append',
						role: 'system',
						text: localize(
							'drox.sessions.loadingUiReplay',
							'Restoring session UI ({0} events)…',
							uiReplay.length,
						),
					});
					await replayUiJournalMessages(this.delegate, uiReplay);
				} else if (read.messages.length > 0) {
					this.delegate.post({
						kind: 'append',
						role: 'system',
						text: localize('drox.sessions.loading', 'Loading {0} message(s) from session…', read.messages.length),
					});
					await replayTranscriptMessages(this.delegate.agentEventHost(), read.messages);
				}
				this.delegate.post({ kind: 'sessionReplayDone' });
			} finally {
				this.delegate.setUiReplayRecordingEnabled(true);
			}
		} catch (e) {
			this.delegate.post({ kind: 'append', role: 'error', text: e instanceof Error ? e.message : String(e) });
		}
	}

	resetActiveTabConversation(): void {
		this.delegate.resolveUserAskSkipped();
		this.delegate.clearCurrentRunId();
		this.chatSessionService.setPendingSessionReset(false);
		this.delegate.syncChatSessionState();
		this.delegate.clearPendingTools();
		const idx = this.currentSessionId
			? this.openTabs.findIndex(t => t.sessionId === this.currentSessionId)
			: -1;
		const newId = newSessionId();
		const replacement: IDroxChatTab = {
			sessionId: newId,
			title: DEFAULT_TAB_TITLE,
			titleFromModel: false,
			uiStats: emptyTabUiStats(),
		};
		if (idx >= 0) {
			this.openTabs[idx] = replacement;
		} else {
			this.openTabs.push(replacement);
		}
		this.currentSessionId = newId;
		this.delegate.syncChatSessionState();
		this.delegate.post({ kind: 'chatReset' });
		this.delegate.post({ kind: 'session', id: newId });
		this.postTabs();
	}

	ensureInitialTab(): void {
		const id = newSessionId();
		this.openTabs.push({
			sessionId: id,
			title: DEFAULT_TAB_TITLE,
			titleFromModel: false,
			uiStats: emptyTabUiStats(),
		});
		this.currentSessionId = id;
		this.delegate.syncChatSessionState();
	}

	/** Purge sessions, carte workspace et mémoire Drox du workspace courant. */
	async resetWorkspaceDroxData(): Promise<void> {
		if (this.delegate.getCurrentRunId()) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.sessions.busy', 'Stop the current run before loading a session.'),
			});
			return;
		}
		const ws = this.getWorkspaceFsPath();
		if (!ws) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.workspace.none', 'No workspace folder open.'),
			});
			return;
		}
		await this.sessionService.resetWorkspace(ws);
		this.layoutStore.clear();
		this.layoutWorkspaceId = undefined;
		this.openTabs.length = 0;
		this.currentSessionId = undefined;
		this.chatSessionService.setPendingSessionReset(false);
		this.delegate.clearCurrentRunId();
		this.delegate.syncChatSessionState();
		this.delegate.clearPendingTools();
		this.ensureInitialTab();
		this.delegate.post({ kind: 'chatReset' });
		this.delegate.post({
			kind: 'append',
			role: 'system',
			text: localize(
				'drox.workspace.resetDone',
				'Données Drox du workspace réinitialisées : conversations, carte projet, mémoire longue, archives mémoire, pièces jointes et cycles professeur supprimés.',
			),
		});
		this.delegate.post({
			kind: 'session',
			id: this.currentSessionId!,
			uiStats: emptyTabUiStats(),
		});
		this.postTabs();
		await this.sendSessionsList();
	}

	async sendSessionsList(): Promise<void> {
		const ws = this.getWorkspaceFsPath();
		if (!ws) {
			this.delegate.post({
				kind: 'sessions',
				items: [],
				currentId: this.currentSessionId ?? null,
				error: localize('drox.workspace.none', 'No workspace folder open.'),
			});
			return;
		}
		try {
			const items = await this.sessionService.listSessions(ws);
			items.sort((a, b) => b.modifiedSecs - a.modifiedSecs);
			const titlesById = new Map(this.openTabs.map(t => [t.sessionId, t.title]));
			const itemsWithTitles = items.map(it => ({
				...it,
				title: titlesById.get(it.id) ?? it.title,
			}));
			this.delegate.post({
				kind: 'sessions',
				items: itemsWithTitles,
				currentId: this.currentSessionId ?? null,
			});
		} catch (e) {
			this.delegate.post({
				kind: 'sessions',
				items: [],
				currentId: this.currentSessionId ?? null,
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}

	async loadSession(id: string): Promise<void> {
		if (!id.startsWith('ses_')) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.sessions.invalidId', 'Invalid session id.'),
			});
			return;
		}
		if (this.delegate.getCurrentRunId()) {
			this.delegate.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.sessions.busy', 'Stop the current run before loading a session.'),
			});
			return;
		}
		if (!this.openTabs.some(t => t.sessionId === id)) {
			this.openTabs.push({
				sessionId: id,
				title: DEFAULT_TAB_TITLE,
				titleFromModel: false,
				uiStats: emptyTabUiStats(),
			});
		}
		await this.activateChatTab(id, { loadMessages: true });
	}

	ensureSessionForSend(): void {
		if (this.currentSessionId) {
			return;
		}
		const id = newSessionId();
		this.currentSessionId = id;
		this.openTabs.push({
			sessionId: id,
			title: DEFAULT_TAB_TITLE,
			titleFromModel: false,
			uiStats: emptyTabUiStats(),
		});
		this.delegate.syncChatSessionState();
		this.delegate.post({ kind: 'session', id });
		this.postTabs();
	}
}
