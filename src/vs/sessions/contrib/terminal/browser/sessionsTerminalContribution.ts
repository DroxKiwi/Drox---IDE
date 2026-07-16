/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalInstance, ITerminalEditorService, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { getSessionTerminalForegroundPolicy } from '../common/sessionTerminalForegroundPolicy.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionsWelcomeVisibleContext, IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { ITerminalProfileService } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ACTIVE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionTaskRunnerRegistry } from '../../chat/browser/sessionTaskRunner.js';
import { AgentHostSessionTaskRunner } from './agentHostSessionTaskRunner.js';

const SessionsTerminalEditorVisibleContext = new RawContextKey<boolean>('sessionsTerminalEditorVisible', false);
/** @deprecated Use {@link SessionsTerminalEditorVisibleContext} — kept for action id compatibility. */
const SessionsTerminalViewVisibleContext = SessionsTerminalEditorVisibleContext;

interface ISessionTerminalInfo {
	/** The cwd to use for terminal matching/creation. For agent host sessions this is the unwrapped file URI. */
	readonly cwd: URI;
	/** When set, the terminal should be created on the agent host rather than locally. */
	readonly agentHostCwd?: URI;
}

/**
 * Returns terminal info for the given session: worktree or repository path for
 * workspace-backed agent sessions. Returns `undefined` for sessions without a
 * workspace (e.g. Cloud), or when no path is available.
 */
function getSessionTerminalInfo(session: ISession | undefined, reader?: IReader): ISessionTerminalInfo | undefined {
	if (!session) {
		return undefined;
	}
	const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
	if (workspace?.isVirtualWorkspace !== false) {
		return undefined;
	}
	const folder = workspace.folders[0];
	const cwd = folder?.workingDirectory;
	if (!cwd) {
		return undefined;
	}
	if (cwd.scheme === AGENT_HOST_SCHEME) {
		return { cwd: fromAgentHostUri(cwd), agentHostCwd: cwd };
	}
	return { cwd };
}

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - Terminals are tracked per session id and shown/hidden based on that association.
 * - Terminals created before session-id tracking fall back to initial cwd matching
 *   until they are associated with a session in this window.
 * - Terminals for archived/removed sessions are hidden/closed using their tracked
 *   session id association while keeping the active terminal protected.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	private _activeKey: string | undefined;
	private _activeSessionId: string | undefined;
	private readonly _sessionTerminals = new Map<string, Set<number>>();

	/**
	 * Bumped whenever session↔terminal tracking or hide/kill changes so dashboard
	 * lamps stay accurate for background (non-focused) sessions.
	 */
	private readonly _trackingVersion = observableValue<number>('sessionsTerminalTrackingVersion', 0);
	readonly trackingVersion: IObservable<number> = this._trackingVersion;

	/**
	 * Session ids already processed as archived. The archive cleanup runs only
	 * on the not-archived → archived transition: the provider keeps archived
	 * sessions cached and re-emits them in `changed` on every sync, so acting on
	 * the current archived state would re-run the cwd cleanup each time and sweep
	 * terminals the user opened afterwards. See #313510, #318645.
	 */
	private readonly _archivedSessionIds = new Set<string>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@ILogService private readonly _logService: ILogService,
		@IPathService private readonly _pathService: IPathService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// Seed with sessions that are already archived (e.g. restored archived
		// from a previous window) so they are not treated as newly archived on
		// their first change event.
		for (const session of this._sessionsManagementService.getSessions()) {
			if (session.isArchived.get()) {
				this._archivedSessionIds.add(session.sessionId);
			}
		}

		const profileOverride = derived(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			if (!session || session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
				return; // no need to override local default profiles with the local AH
			}

			const address = this._getSessionAgentHostAddress(session);
			if (!address) {
				return;
			}

			const profiles = this._agentHostTerminalService.profiles.read(reader);
			return profiles.find(p => p.address === address) ?? this._agentHostTerminalService.getProfileForConnection(address);
		});

		this._register(autorun(reader => {
			const profile = profileOverride.read(reader);
			if (profile) {
				reader.store.add(this._terminalProfileService.overrideDefaultProfile(
					profile.extensionIdentifier, profile.profileId,
				));
			}
		}));

		// Keep the default cwd in sync with the active session's working directory
		// so that "New Terminal" uses it automatically.
		// This is a little hacky but I don't see any better approach.
		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			if (session?.loading.read(reader)) {
				this._agentHostTerminalService.setDefaultCwd(undefined);
				return;
			}
			const info = getSessionTerminalInfo(session, reader);
			this._agentHostTerminalService.setDefaultCwd(info?.cwd);
		}));

		// Track whether a session terminal tab is open in the editor part (P6-E3).
		const terminalEditorVisible = SessionsTerminalEditorVisibleContext.bindTo(contextKeyService);
		const updateTerminalEditorVisible = () => {
			const activeSessionId = this._activeSessionId;
			const hasActiveSessionTerminal = activeSessionId !== undefined
				&& this._getTrackedTerminalsForSession(activeSessionId).some(instance =>
					instance.target === TerminalLocation.Editor
					&& this._terminalEditorService.instances.includes(instance));
			terminalEditorVisible.set(
				this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && hasActiveSessionTerminal,
			);
		};
		updateTerminalEditorVisible();
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.EDITOR_PART) {
				updateTerminalEditorVisible();
			}
		}));
		this._register(this._terminalEditorService.onDidChangeInstances(() => updateTerminalEditorVisible()));

		// React to active session changes — use worktree/repo for background sessions, home dir otherwise
		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			if (session?.loading.read(reader)) {
				this._activeKey = undefined;
				this._activeSessionId = undefined;
				return;
			}
			this._onActiveSessionChanged(session);
		}));

		// When a session is replaced (untitled → committed graduation), transfer
		// tracked terminals from the old session id to the new one so they are
		// not orphaned and closed by the removal cleanup.
		this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			const terminalIds = this._sessionTerminals.get(from.sessionId);
			if (terminalIds && terminalIds.size > 0) {
				let targetIds = this._sessionTerminals.get(to.sessionId);
				if (!targetIds) {
					targetIds = new Set<number>();
					this._sessionTerminals.set(to.sessionId, targetIds);
				}
				for (const id of terminalIds) {
					targetIds.add(id);
				}
				this._logService.trace(`[SessionsTerminal] Transferred ${terminalIds.size} terminal(s) from session ${from.sessionId} to ${to.sessionId}`);
			}
			this._sessionTerminals.delete(from.sessionId);
		}));

		// Clean up tracked terminal ids when terminals are externally disposed
		// (e.g. user closes a terminal tab) so the map doesn't hold stale entries.
		this._register(this._terminalService.onDidDisposeInstance(instance => {
			this._removeTerminalFromTrackedSessions(instance.instanceId);
		}));

		// Hide restored terminals from a previous window session that don't
		// belong to the current active session. These arrive asynchronously
		// during reconnection and would otherwise flash in the foreground.
		this._register(this._terminalService.onDidCreateInstance(instance => {
			// Skip hidden tool terminals — managed by the chat tool lifecycle
			if (instance.shellLaunchConfig.hideFromUser) {
				return;
			}
			if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
				void instance.getInitialCwd().then(async cwd => {
					if (cwd.toLowerCase() !== this._activeKey) {
						const availableInstance = this._getAvailableTerminal(instance, `hide restored terminal for ${cwd}`);
						if (!availableInstance) {
							return;
						}
						await this._hideTerminalInstance(availableInstance);
						this._logService.trace(`[SessionsTerminal] Hid restored terminal ${availableInstance.instanceId} (cwd: ${cwd})`);
					}
				});
			}
		}));

		// Clean up terminals for archived/removed sessions using their tracked
		// session-to-terminal associations.
		//
		// Archive vs remove differ in how aggressive the cleanup is:
		// - Archiving is reversible and terminals can be reused by
		//   the same session, so we only HIDE the terminal (the pty survives and can
		//   be shown again on unarchive or reuse). See `_hideTerminalsForSession`.
		// - Removal is an explicit, destructive user action, so we KILL the
		//   terminal. See `_closeTerminalsForSession`.
		//
		// The archive cleanup runs only on the not-archived → archived transition.
		// The provider keeps archived sessions cached and re-emits them in
		// `changed` on every sync; acting on the current archived state would
		// re-run the cwd cleanup each time and sweep terminals the user opened
		// after archiving.
		//
		// Both paths are asynchronous and can land while the user is working in a
		// just-opened terminal at this cwd (e.g. removal also covers untitled →
		// committed graduation via `onDidReplaceSession`, which surfaces the
		// skeleton in `removed`). The focused (active) terminal is therefore never
		// touched on either path. See #313510, #318645.

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			// Only act on the not-archived → archived transition; ignore re-emits
			// of sessions already known to be archived. Keep the tracked set in
			// sync: record sessions that arrive already-archived (e.g. restored
			// from a previous window) so they never count as a fresh transition,
			// and drop ids that were un-archived or removed.
			for (const session of e.added) {
				if (session.isArchived.get()) {
					this._archivedSessionIds.add(session.sessionId);
				}
			}
			const justArchived: ISession[] = [];
			for (const session of e.changed) {
				if (session.isArchived.get()) {
					if (!this._archivedSessionIds.has(session.sessionId)) {
						this._archivedSessionIds.add(session.sessionId);
						justArchived.push(session);
					}
				} else {
					this._archivedSessionIds.delete(session.sessionId);
				}
			}
			for (const session of e.removed) {
				this._archivedSessionIds.delete(session.sessionId);
			}
			if (e.removed.length === 0 && justArchived.length === 0) {
				return;
			}
			this._logService.trace(`[SessionsTerminal] onDidChangeSessions cleanup (removed: ${e.removed.length}, justArchived: ${justArchived.length}, trackedSessions: ${this._sessionTerminals.size}, activeKey: ${this._activeKey ?? '<none>'})`);
			for (const session of e.removed) {
				void this._closeTerminalsForSession(session.sessionId, `session removed (${session.sessionId})`).finally(() => this._sessionTerminals.delete(session.sessionId));
			}
			for (const session of justArchived) {
				void this._hideTerminalsForSession(session.sessionId, `session archived (${session.sessionId})`);
			}
		}));
	}

	/**
	 * Ensures a terminal exists for the given cwd. When a session is provided,
	 * tracked terminals for that session id are preferred; otherwise the method
	 * falls back to matching untracked terminals by initial cwd for backward
	 * compatibility before creating a new terminal. Sets newly created terminals
	 * as active and optionally focuses them.
	 *
	 * When {@link session} is provided and the session is backed by an agent
	 * host, the terminal is created on the agent host instead of locally.
	 */
	/**
	 * Always creates a new terminal for the session cwd (or user home) and opens
	 * it as an editor tab. Unlike {@link ensureTerminal}, existing terminals are
	 * not reused — used by the editor "+" menu for multiple terminal tabs.
	 */
	async openNewTerminal(session?: ISession): Promise<ITerminalInstance | undefined> {
		const info = getSessionTerminalInfo(session);
		const cwd = info?.cwd ?? await this._pathService.userHome();
		try {
			const instance = await this._createTerminalForSession(cwd, session);
			const createdInstance = this._getAvailableTerminal(instance, `open new terminal for ${cwd.fsPath}`);
			if (!createdInstance) {
				return undefined;
			}
			if (session) {
				this._trackTerminalsForSession(session.sessionId, [createdInstance]);
			}
			this._terminalService.setActiveInstance(createdInstance);
			await this._openTerminalInEditor(createdInstance, true);
			await this._terminalService.focusActiveInstance();
			this._logService.trace(`[SessionsTerminal] Opened new terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
			return createdInstance;
		} catch (e) {
			this._logService.trace(`[SessionsTerminal] Cannot create new terminal for ${cwd.fsPath}: ${e}`);
			return undefined;
		}
	}

	async ensureTerminal(cwd: URI, focus: boolean, session?: ISession): Promise<ITerminalInstance[]> {
		const key = cwd.fsPath.toLowerCase();
		let existing = session ? this._getTrackedTerminalsForSession(session.sessionId) : [];
		if (existing.length === 0) {
			existing = await this._findTerminalsForKey(key, { excludeTracked: !!session });
		}

		if (existing.length === 0) {
			try {
				const instance = await this._createTerminalForSession(cwd, session);
				const createdInstance = this._getAvailableTerminal(instance, `activate created terminal for ${cwd.fsPath}`);
				if (!createdInstance) {
					return [];
				}
				existing = [createdInstance];
				this._terminalService.setActiveInstance(createdInstance);
				this._logService.trace(`[SessionsTerminal] Created terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
			} catch (e) {
				this._logService.trace(`[SessionsTerminal] Cannot create terminal for ${cwd.fsPath}: ${e}`);
				return [];
			}
		}

		if (session) {
			this._trackTerminalsForSession(session.sessionId, existing);
		}

		for (const instance of existing) {
			await this._openTerminalInEditor(instance, focus && instance === existing[0]);
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}

		return existing;
	}

	getTrackedEditorTerminals(sessionId: string): ITerminalInstance[] {
		return this._getTrackedTerminalsForSession(sessionId)
			.filter(instance => instance.target === TerminalLocation.Editor);
	}

	/** True if the session has any live tracked shell (editor or background). */
	hasTrackedShellForSession(sessionId: string): boolean {
		return this._getTrackedTerminalsForSession(sessionId).length > 0;
	}

	hasActiveShellForSession(sessionId: string): boolean {
		// Any live tracked shell (editor or background) — not only "busy" child
		// processes, so background-persistent cards stay accurate after hide.
		return this.hasTrackedShellForSession(sessionId);
	}

	async killSessionTerminals(sessionId: string): Promise<void> {
		await this._closeTerminalsForSession(sessionId, 'drox session switch (non-persistent)');
	}

	async hideSessionTerminals(sessionId: string): Promise<void> {
		await this._hideTerminalsForSession(sessionId, 'drox session background (persistent)');
	}

	/**
	 * Re-opens tracked shells for a session in the editor without creating new ones.
	 * Used after restoring a background-persistent layout snapshot.
	 */
	async revealSessionTerminals(sessionId: string): Promise<void> {
		const instances = this._getTrackedTerminalsForSession(sessionId);
		if (instances.length === 0) {
			return;
		}
		for (const instance of instances) {
			await this._openTerminalInEditor(instance, false);
		}
	}

	/**
	 * Associates a terminal editor tab with the active session (or the given session).
	 * Used when tabs are restored from a session working set or opened outside
	 * {@link ensureTerminal} / {@link openNewTerminal}.
	 */
	attachTerminalToSession(instance: ITerminalInstance, session?: ISession): void {
		if (instance.shellLaunchConfig.hideFromUser) {
			return;
		}
		const targetSession = session ?? this._sessionsService.activeSession.get();
		if (!targetSession) {
			return;
		}
		this._trackTerminalsForSession(targetSession.sessionId, [instance]);
	}

	private async _openTerminalInEditor(instance: ITerminalInstance, focus: boolean): Promise<void> {
		const availableInstance = this._getAvailableTerminal(instance, 'open terminal in editor');
		if (!availableInstance) {
			return;
		}
		if (availableInstance.target !== TerminalLocation.Editor) {
			this._terminalService.moveToEditor(availableInstance);
		}
		await this._terminalEditorService.openEditor(availableInstance, { viewColumn: ACTIVE_GROUP, preserveFocus: !focus });
		this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
	}

	/**
	 * Creates a terminal for the given cwd. If the session is backed by an
	 * agent host, creates an agent host terminal; otherwise creates a local one.
	 */
	private async _createTerminalForSession(cwd: URI, session: ISession | undefined): Promise<ITerminalInstance> {
		const address = session && this._getSessionAgentHostAddress(session);
		if (address) {
			const instance = await this._agentHostTerminalService.createTerminalForEntry(address, { cwd });
			if (instance) {
				return instance;
			}
		}
		return this._terminalService.createTerminal({ config: { cwd } });
	}

	/**
	 * Returns the agent host address for the given session's provider,
	 * or `undefined` if the session is not backed by an agent host.
	 */
	private _getSessionAgentHostAddress(session: ISession | undefined): string | undefined {
		if (!session) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider.remoteAddress ?? '__local__';
	}

	private async _onActiveSessionChanged(session: ISession | undefined): Promise<void> {
		if (!session) {
			return;
		}

		if (getSessionTerminalForegroundPolicy(session.sessionId) === 'suppressEnsure') {
			return;
		}

		const info = getSessionTerminalInfo(session);
		const targetPath = info?.cwd ?? await this._pathService.userHome();
		const targetKey = targetPath.fsPath.toLowerCase();
		if (this._activeKey === targetKey && this._activeSessionId === session.sessionId) {
			return;
		}
		this._activeKey = targetKey;
		this._activeSessionId = session.sessionId;

		const instances = await this.ensureTerminal(targetPath, false, session);

		// If the active session or key changed while we were awaiting, a newer
		// call has taken over — skip the visibility update to avoid flicker.
		if (this._activeKey !== targetKey || this._activeSessionId !== session.sessionId) {
			return;
		}
		await this._updateTerminalVisibility(session, targetKey, instances.map(instance => instance.instanceId));
	}

	/**
	 * Finds all terminal instances whose initial cwd (lower-cased) matches
	 * the given key.
	 */
	private async _findTerminalsForKey(key: string, options?: { excludeTracked?: boolean }): Promise<ITerminalInstance[]> {
		const result: ITerminalInstance[] = [];
		for (const instance of this._terminalService.instances) {
			// Skip hidden tool terminals — managed by the chat tool lifecycle
			if (instance.shellLaunchConfig.hideFromUser) {
				continue;
			}
			if (options?.excludeTracked && this._isTerminalTracked(instance.instanceId)) {
				continue;
			}
			try {
				const cwd = await instance.getInitialCwd();
				if (cwd.toLowerCase() === key) {
					result.push(instance);
				}
			} catch {
				// ignore terminals whose cwd cannot be resolved
			}
		}
		return result;
	}

	private _trackTerminalsForSession(sessionId: string, instances: readonly ITerminalInstance[]): void {
		if (instances.length === 0) {
			return;
		}
		let terminalIds = this._sessionTerminals.get(sessionId);
		if (!terminalIds) {
			terminalIds = new Set<number>();
			this._sessionTerminals.set(sessionId, terminalIds);
		}
		let changed = false;
		for (const instance of instances) {
			if (!terminalIds.has(instance.instanceId)) {
				terminalIds.add(instance.instanceId);
				changed = true;
			}
		}
		if (changed) {
			this._bumpTrackingVersion();
		}
	}

	private _getTrackedTerminalsForSession(sessionId: string): ITerminalInstance[] {
		const terminalIds = this._sessionTerminals.get(sessionId);
		if (!terminalIds) {
			return [];
		}

		const result: ITerminalInstance[] = [];
		for (const instanceId of [...terminalIds]) {
			const instance = this._terminalService.getInstanceFromId(instanceId);
			if (!instance || instance.isDisposed || instance.shellLaunchConfig.hideFromUser) {
				terminalIds.delete(instanceId);
				continue;
			}
			result.push(instance);
		}

		if (terminalIds.size === 0) {
			this._sessionTerminals.delete(sessionId);
		}

		return result;
	}

	private _isTerminalTracked(instanceId: number): boolean {
		for (const [sessionId, terminalIds] of this._sessionTerminals) {
			if (terminalIds.has(instanceId)) {
				const instance = this._terminalService.getInstanceFromId(instanceId);
				if (!instance || instance.isDisposed) {
					terminalIds.delete(instanceId);
					if (terminalIds.size === 0) {
						this._sessionTerminals.delete(sessionId);
					}
					continue;
				}
				return true;
			}
		}
		return false;
	}

	private _removeTerminalFromTrackedSessions(instanceId: number): void {
		let changed = false;
		for (const [sessionId, terminalIds] of this._sessionTerminals) {
			if (terminalIds.delete(instanceId)) {
				changed = true;
			}
			if (terminalIds.size === 0) {
				this._sessionTerminals.delete(sessionId);
			}
		}
		if (changed) {
			this._bumpTrackingVersion();
		}
	}

	private _bumpTrackingVersion(): void {
		this._trackingVersion.set(this._trackingVersion.get() + 1, undefined);
	}

	private _getAvailableTerminal(instance: ITerminalInstance, action: string): ITerminalInstance | undefined {
		const currentInstance = this._terminalService.getInstanceFromId(instance.instanceId);
		if (!currentInstance || currentInstance.isDisposed) {
			this._logService.trace(`[SessionsTerminal] Cannot ${action}; terminal ${instance.instanceId} is no longer available`);
			return undefined;
		}
		return currentInstance;
	}

	/**
	 * Ensures the active session's primary terminal is open in the editor part.
	 * Cross-session tab visibility is handled by per-session editor working sets.
	 */
	private async _updateTerminalVisibility(_activeSession: ISession, _activeKey: string, forceForegroundTerminalIds: number[]): Promise<void> {
		const primaryId = forceForegroundTerminalIds[0];
		if (primaryId === undefined) {
			return;
		}
		const instance = this._terminalService.getInstanceFromId(primaryId);
		if (!instance) {
			return;
		}
		await this._openTerminalInEditor(instance, false);
	}

	private async _hideTerminalInstance(instance: ITerminalInstance): Promise<void> {
		if (instance.target === TerminalLocation.Editor) {
			this._terminalEditorService.detachInstance(instance);
			return;
		}
		this._terminalService.moveToBackground(instance);
	}

	/**
	 * Disposes (kills) terminals associated with the given session id. Used
	 * when a session is removed: removal is an explicit user action, so the pty
	 * is torn down.
	 *
	 * Never disposes the terminal the user is currently working in. Removal also
	 * covers session *graduation* (untitled → committed via `onDidReplaceSession`,
	 * which surfaces the skeleton in `removed`): the focused (active) instance is
	 * therefore always protected.
	 *
	 * {@link reason} is logged for each killed terminal so unexpected disposals in
	 * the agents window can be diagnosed from the logs. See #313510, #318645.
	 */
	private async _closeTerminalsForSession(sessionId: string, reason: string): Promise<void> {
		const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
		for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
			if (protectedInstanceId !== undefined && instance.instanceId === protectedInstanceId) {
				this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
				continue;
			}
			const availableInstance = this._getAvailableTerminal(instance, `close removed session terminal for session ${sessionId}`);
			if (!availableInstance) {
				continue;
			}
			this._logService.info(`[SessionsTerminal] Killing terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
			await this._terminalService.safeDisposeTerminal(availableInstance);
			this._removeTerminalFromTrackedSessions(availableInstance.instanceId);
		}
	}

	/**
	 * Hides (moves to background) terminals associated with the given session id
	 * without disposing them. Used when a session is archived ("Mark as Done"):
	 * archiving is reversible and the pty must survive so it can be shown again.
	 *
	 * Archiving is asynchronous and can land while the user is working in a
	 * just-opened terminal at this cwd, so the focused (active) instance is
	 * never hidden out from under the user.
	 *
	 * {@link reason} is logged for each hidden terminal so unexpected visibility
	 * changes in the agents window can be diagnosed from the logs. See #313510,
	 * #318645.
	 */
	private async _hideTerminalsForSession(sessionId: string, reason: string): Promise<void> {
		const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
		for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
			if (protectedInstanceId !== undefined && instance.instanceId === protectedInstanceId) {
				this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
				continue;
			}
			const availableInstance = this._getAvailableTerminal(instance, `hide archived terminal for session ${sessionId}`);
			if (!availableInstance) {
				continue;
			}
			this._logService.info(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
			await this._hideTerminalInstance(availableInstance);
		}
		this._bumpTrackingVersion();
	}

	async dumpTracking(): Promise<void> {
		console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? '<none>'}`);
		console.log(`[SessionsTerminal] Session terminals: ${JSON.stringify([...this._sessionTerminals.entries()].map(([sessionId, terminalIds]) => [sessionId, [...terminalIds]]))}`);
		console.log('[SessionsTerminal] === All Terminals ===');
		for (const instance of this._terminalService.instances) {
			let cwd = '<unknown>';
			try { cwd = await instance.getInitialCwd(); } catch { /* ignored */ }
			const isForeground = this._terminalService.foregroundInstances.includes(instance);
			console.log(`  ${instance.instanceId} - ${cwd} - ${isForeground ? 'foreground' : 'background'}`);
		}
	}

	async showAllTerminals(): Promise<void> {
		for (const instance of this._terminalService.instances) {
			await this._openTerminalInEditor(instance, false);
		}
	}
}

registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);

/**
 * Registers an {@link AgentHostSessionTaskRunner} with the
 * {@link ISessionTaskRunnerRegistry}. Lives next to the other agent-host
 * terminal wiring so that the runner is removed together with the rest of
 * the sessions terminal contribution if the agents app shuts down.
 */
class RegisterAgentHostSessionTaskRunnerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.registerAgentHostTaskRunner';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionTaskRunnerRegistry registry: ISessionTaskRunnerRegistry,
	) {
		super();
		const runner = instantiationService.createInstance(AgentHostSessionTaskRunner);
		this._register(registry.register(runner));
	}
}

registerWorkbenchContribution2(RegisterAgentHostSessionTaskRunnerContribution.ID, RegisterAgentHostSessionTaskRunnerContribution, WorkbenchPhase.BlockStartup);

class OpenSessionInTerminalAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.openInTerminal',
			title: localize2('openInTerminal', "Open Terminal"),
			icon: Codicon.terminal,
			toggled: {
				condition: SessionsTerminalViewVisibleContext,
				title: localize('hideTerminal', "Hide Terminal"),
			},
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(_accessor: ServicesAccessor): Promise<void> {
		const telemetryService = _accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openTerminal');

		const layoutService = _accessor.get(IAgentWorkbenchLayoutService);
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		const sessionsService = _accessor.get(ISessionsService);
		const pathService = _accessor.get(IPathService);
		const terminalEditorService = _accessor.get(ITerminalEditorService);

		const activeSession = sessionsService.activeSession.get();
		const activeSessionId = activeSession?.sessionId;
		const hasSessionTerminalInEditor = activeSessionId !== undefined
			&& contribution.getTrackedEditorTerminals(activeSessionId).length > 0;

		// Toggle: hide the editor part when the session terminal tab is already open.
		if (layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && hasSessionTerminalInEditor) {
			layoutService.setPartHidden(true, Parts.EDITOR_PART);
			return;
		}

		const info = getSessionTerminalInfo(activeSession);
		const cwd = info?.cwd ?? await pathService.userHome();
		await contribution.ensureTerminal(cwd, true, activeSession);

		// Focus the terminal editor tab if it was already open but not focused.
		if (hasSessionTerminalInEditor) {
			await terminalEditorService.revealActiveEditor(false);
		}
	}
}

registerAction2(OpenSessionInTerminalAction);

class DumpTerminalTrackingAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.dumpTerminalTracking',
			title: localize2('dumpTerminalTracking', "Dump Terminal Tracking"),
			f1: true,
		});
	}

	override async run(): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.dumpTracking();
	}
}

registerAction2(DumpTerminalTrackingAction);

class ShowAllTerminalsAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.showAllTerminals',
			title: localize2('showAllTerminals', "Show All Terminals"),
			f1: true,
		});
	}

	override async run(): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.showAllTerminals();
	}
}

registerAction2(ShowAllTerminalsAction);
