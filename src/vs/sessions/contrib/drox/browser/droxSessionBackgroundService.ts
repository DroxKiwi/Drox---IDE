/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { getWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { isDroxAgentsWindowEnabled } from '../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { LayoutController } from '../../layout/browser/desktopSessionLayoutController.js';
import { registerSessionOpenGateAfterOpen, registerSessionOpenGatePrepare } from '../../../services/sessions/common/sessionOpenGate.js';
import { registerSessionTerminalForegroundPolicy } from '../../terminal/common/sessionTerminalForegroundPolicy.js';
import { SessionsTerminalContribution } from '../../terminal/browser/sessionsTerminalContribution.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import {
	DROX_SKIP_BACKGROUND_SWITCH_CONFIRM_KEY,
	IDroxSessionBackgroundService,
	IDroxSessionDashboardSignals,
	IDroxSessionLayoutSnapshot,
	IDroxSessionResourceMetricsView,
} from '../common/droxSessionBackgroundService.js';
import {
	attributeSharedLoad,
	diskBytesToPercent,
	DROX_RESOURCE_METRICS_POLL_MS,
	DroxSessionNetworkEstimator,
	DroxSessionResourceMetricsRing,
	estimateSessionDiskBytes,
	sessionResourceActivityWeight,
} from '../common/droxSessionResourceMetrics.js';
import {
	applyDroxDefaultWorkspaceTemplate,
	applyDroxSessionLayoutSnapshot,
	captureDroxSessionLayoutSnapshot,
	deleteDroxSessionLayoutSnapshot,
} from './droxSessionWorkspaceLayout.js';

const EMPTY_RESOURCE_METRICS: IDroxSessionResourceMetricsView = {
	cpuPercent: 0,
	ramPercent: 0,
	diskPercent: 0,
	downloadPercent: 0,
	uploadPercent: 0,
	cpuHistory: [],
	ramHistory: [],
	diskHistory: [],
	downloadHistory: [],
	uploadHistory: [],
};

export class DroxSessionBackgroundService extends Disposable implements IDroxSessionBackgroundService {

	declare readonly _serviceBrand: undefined;

	private readonly _persistentSessionIds = observableValue<ReadonlySet<string>>('droxPersistentSessionIds', new Set());
	readonly persistentSessionIds: IObservable<ReadonlySet<string>> = this._persistentSessionIds;

	private readonly _layoutSnapshots = new Map<string, IDroxSessionLayoutSnapshot>();
	private readonly _suppressTerminalEnsureSessionIds = new Set<string>();
	private readonly _dashboardSignals = new Map<string, IObservable<IDroxSessionDashboardSignals>>();
	private readonly _resourceRings = new Map<string, DroxSessionResourceMetricsRing>();
	private readonly _networkEstimators = new Map<string, DroxSessionNetworkEstimator>();
	private readonly _resourceMetricsViews = new Map<string, IObservable<IDroxSessionResourceMetricsView>>();
	private readonly _droxCachePresence = new Map<string, boolean>();
	/** Session id that already received foreground layout for the current visit. */
	private _appliedForegroundLayoutSessionId: string | undefined;
	/** Bumped on each apply so deferred workspace waits can detect supersession. */
	private _applyForegroundLayoutGeneration = 0;
	/** Forces dashboard re-sample (shell/git) while sessions stay background-persistent. */
	private readonly _dashboardPollTick = observableValue<number>('droxDashboardPollTick', 0);
	/** Bumped after each resource metrics sample so UI/% history stay live. */
	private readonly _resourceMetricsTick = observableValue<number>('droxResourceMetricsTick', 0);
	private _resourceSampleInFlight = false;

	constructor(
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IChatService private readonly _chatService: IChatService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();

		registerSessionOpenGatePrepare(context => this._prepareSessionSwitch(context.from, context.toResource));
		registerSessionOpenGateAfterOpen(session => this.applyForegroundLayout(session));
		registerSessionTerminalForegroundPolicy(sessionId => this.getTerminalForegroundPolicy(sessionId));

		const pollTimer = this._register(new IntervalTimer());
		pollTimer.cancelAndSet(() => {
			if (this._persistentSessionIds.get().size === 0) {
				return;
			}
			this._dashboardPollTick.set(this._dashboardPollTick.get() + 1, undefined);
		}, 1500);

		const metricsTimer = this._register(new IntervalTimer());
		metricsTimer.cancelAndSet(() => {
			if (this._persistentSessionIds.get().size === 0) {
				return;
			}
			void this._samplePersistentResourceMetrics();
		}, DROX_RESOURCE_METRICS_POLL_MS);
	}

	isPersistent(sessionId: string): boolean {
		return this._persistentSessionIds.get().has(sessionId);
	}

	setPersistent(sessionId: string, value: boolean): void {
		const next = new Set(this._persistentSessionIds.get());
		if (value) {
			next.add(sessionId);
			this._ensureResourceRing(sessionId);
			const session = this._findSessionById(sessionId);
			if (session) {
				const snapshot = captureDroxSessionLayoutSnapshot(
					sessionId,
					this._editorService,
					this._editorGroupsService,
					this._layoutService,
					this._viewsService,
				);
				this._replaceLayoutSnapshot(sessionId, snapshot);
				this._adoptSnapshotIntoLayoutController(session.resource, snapshot);
			}
			void this._samplePersistentResourceMetrics();
		} else {
			next.delete(sessionId);
			const session = this._findSessionById(sessionId);
			this._clearLayoutSnapshot(sessionId);
			this._clearResourceMetrics(sessionId);
			if (session) {
				this._forgetUpstreamLayout(session);
			}
		}
		this._persistentSessionIds.set(next, undefined);
	}

	hasLayoutSnapshot(sessionId: string): boolean {
		return this._layoutSnapshots.has(sessionId);
	}

	getTerminalForegroundPolicy(sessionId: string | undefined): 'default' | 'suppressEnsure' {
		if (!sessionId) {
			return 'default';
		}
		return this._suppressTerminalEnsureSessionIds.has(sessionId) ? 'suppressEnsure' : 'default';
	}

	async suspendForegroundSession(session: ISession, options: { readonly kill: boolean }): Promise<void> {
		if (options.kill) {
			this._clearLayoutSnapshot(session.sessionId);
			this._clearResourceMetrics(session.sessionId);
			this._forgetUpstreamLayout(session);
			await this._killSessionRuntime(session);
			return;
		}

		if (this.isPersistent(session.sessionId)) {
			const snapshot = captureDroxSessionLayoutSnapshot(
				session.sessionId,
				this._editorService,
				this._editorGroupsService,
				this._layoutService,
				this._viewsService,
			);
			this._replaceLayoutSnapshot(session.sessionId, snapshot);
			// Sync LayoutController before editors are cleared by the next session's
			// template — otherwise a delayed cross-directory settle saves/applies empty.
			this._adoptSnapshotIntoLayoutController(session.resource, snapshot);
			await this._suspendSessionTerminals(session.sessionId);
		}
	}

	async applyForegroundLayout(session: ISession): Promise<void> {
		if (session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}

		// Apply once per session entry (switch / restore). Re-entrant calls — e.g.
		// cold-start reconcile after sessions load — must not stomp open editors.
		if (this._appliedForegroundLayoutSessionId === session.sessionId) {
			return;
		}
		this._appliedForegroundLayoutSessionId = session.sessionId;
		const generation = ++this._applyForegroundLayoutGeneration;

		// Cross-directory switches update workspace folders asynchronously. Applying
		// a snapshot (or even the default template) before folders match can fail to
		// open editors / get stomped when the folder change settles.
		await this._whenWorkspaceMatchesSession(session);
		if (generation !== this._applyForegroundLayoutGeneration
			|| this._appliedForegroundLayoutSessionId !== session.sessionId) {
			return;
		}

		const snapshot = this._layoutSnapshots.get(session.sessionId);
		if (this.isPersistent(session.sessionId) && snapshot) {
			this._suppressTerminalEnsureSessionIds.delete(session.sessionId);
			this._adoptSnapshotIntoLayoutController(session.resource, snapshot);
			await applyDroxSessionLayoutSnapshot(snapshot, this._editorGroupsService, this._layoutService, this._viewsService);
			return;
		}

		this._suppressTerminalEnsureSessionIds.add(session.sessionId);
		// Drop upstream per-session editor working sets so LayoutController does not
		// re-reveal an empty editor column after we apply the default template.
		this._forgetUpstreamLayout(session);
		await applyDroxDefaultWorkspaceTemplate(this._editorGroupsService, this._layoutService, this._viewsService);
		this._suppressTerminalEnsureSessionIds.delete(session.sessionId);
	}

	getDashboardSignals(sessionId: string): IObservable<IDroxSessionDashboardSignals> {
		let existing = this._dashboardSignals.get(sessionId);
		if (existing) {
			return existing;
		}

		// Always derived so persistence and session state stay reactive even if the
		// session is not registered yet when the list row first renders.
		existing = derived<IDroxSessionDashboardSignals>(reader => {
			const persistent = this._persistentSessionIds.read(reader).has(sessionId);
			// Poll + terminal tracking bumps keep lamps accurate whether this
			// session is focused or sitting in the background.
			this._dashboardPollTick.read(reader);
			const session = this._findSessionById(sessionId);

			if (!session) {
				return {
					shellActive: false,
					modelActive: false,
					gitOperationActive: false,
					needsInput: false,
					backgroundPersistent: persistent,
				};
			}

			const status = session.status.read(reader);
			const workspace = session.workspace.read(reader);
			const gitRepo = workspace?.folders[0]?.gitRepository;
			const hasGitOperation = gitRepo?.hasGitOperationInProgress ?? false;

			let shellActive = false;
			try {
				const terminalContribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
				terminalContribution.trackingVersion.read(reader);
				shellActive = terminalContribution.hasTrackedShellForSession(sessionId);
			} catch {
				// contribution not ready yet
			}

			return {
				shellActive,
				modelActive: status === SessionStatus.InProgress,
				gitOperationActive: hasGitOperation,
				needsInput: status === SessionStatus.NeedsInput,
				backgroundPersistent: persistent,
			};
		});

		this._dashboardSignals.set(sessionId, existing);
		return existing;
	}

	getResourceMetrics(sessionId: string): IObservable<IDroxSessionResourceMetricsView> {
		let existing = this._resourceMetricsViews.get(sessionId);
		if (existing) {
			return existing;
		}

		existing = derived<IDroxSessionResourceMetricsView>(reader => {
			this._resourceMetricsTick.read(reader);
			if (!this._persistentSessionIds.read(reader).has(sessionId)) {
				return EMPTY_RESOURCE_METRICS;
			}
			const ring = this._resourceRings.get(sessionId);
			const latest = ring?.latest();
			if (!ring || !latest) {
				return EMPTY_RESOURCE_METRICS;
			}
			return {
				cpuPercent: latest.cpuPercent,
				ramPercent: latest.ramPercent,
				diskPercent: latest.diskPercent,
				downloadPercent: latest.downloadPercent,
				uploadPercent: latest.uploadPercent,
				cpuHistory: ring.series('cpu'),
				ramHistory: ring.series('ram'),
				diskHistory: ring.series('disk'),
				downloadHistory: ring.series('download'),
				uploadHistory: ring.series('upload'),
			};
		});
		this._resourceMetricsViews.set(sessionId, existing);
		return existing;
	}

	private _ensureResourceRing(sessionId: string): DroxSessionResourceMetricsRing {
		let ring = this._resourceRings.get(sessionId);
		if (!ring) {
			ring = new DroxSessionResourceMetricsRing();
			this._resourceRings.set(sessionId, ring);
		}
		return ring;
	}

	private _ensureNetworkEstimator(sessionId: string): DroxSessionNetworkEstimator {
		let estimator = this._networkEstimators.get(sessionId);
		if (!estimator) {
			estimator = new DroxSessionNetworkEstimator();
			this._networkEstimators.set(sessionId, estimator);
		}
		return estimator;
	}

	private _clearResourceMetrics(sessionId: string): void {
		this._resourceRings.delete(sessionId);
		this._networkEstimators.delete(sessionId);
		this._droxCachePresence.delete(sessionId);
		this._resourceMetricsTick.set(this._resourceMetricsTick.get() + 1, undefined);
	}

	private async _samplePersistentResourceMetrics(): Promise<void> {
		if (this._resourceSampleInFlight) {
			return;
		}
		const persistentIds = [...this._persistentSessionIds.get()];
		if (persistentIds.length === 0) {
			return;
		}

		this._resourceSampleInFlight = true;
		try {
			let systemCpu = 0;
			let systemRam = 0;
			try {
				const [stats, props] = await Promise.all([
					this._nativeHostService.getOSStatistics(),
					this._nativeHostService.getOSProperties(),
				]);
				const cpuCount = Math.max(1, props.cpus?.length || 1);
				systemCpu = Math.min(100, (stats.loadavg[0] / cpuCount) * 100);
				systemRam = stats.totalmem > 0
					? Math.min(100, ((stats.totalmem - stats.freemem) / stats.totalmem) * 100)
					: 0;
			} catch {
				// Native host unavailable — leave system load at 0.
			}

			const foregroundId = this._appliedForegroundLayoutSessionId;
			const now = Date.now();

			type Weighted = {
				sessionId: string;
				weight: number;
				diskPercent: number;
				downloadPercent: number;
				uploadPercent: number;
			};
			const weighted: Weighted[] = [];
			let totalWeight = 0;

			for (const sessionId of persistentIds) {
				const session = this._findSessionById(sessionId);
				const signals = this._readActivitySignals(sessionId, session);
				const isForeground = foregroundId === sessionId;
				const activity = {
					modelActive: signals.modelActive,
					shellActive: signals.shellActive,
					gitOperationActive: signals.gitOperationActive,
					isForeground,
				};
				const weight = sessionResourceActivityWeight(activity);
				totalWeight += weight;

				const changeCount = session?.changes.get().length ?? 0;
				let hasDroxCache = this._droxCachePresence.get(sessionId) ?? false;
				if (session && !this._droxCachePresence.has(sessionId)) {
					hasDroxCache = await this._probeDroxCacheDir(session);
					this._droxCachePresence.set(sessionId, hasDroxCache);
				}
				const diskPercent = diskBytesToPercent(estimateSessionDiskBytes(changeCount, hasDroxCache));
				const network = this._ensureNetworkEstimator(sessionId).tick(activity);
				weighted.push({
					sessionId,
					weight,
					diskPercent,
					downloadPercent: network.downloadPercent,
					uploadPercent: network.uploadPercent,
				});
			}

			for (const entry of weighted) {
				const ring = this._ensureResourceRing(entry.sessionId);
				ring.push({
					cpuPercent: attributeSharedLoad(systemCpu, entry.weight, totalWeight),
					ramPercent: attributeSharedLoad(systemRam, entry.weight, totalWeight),
					diskPercent: entry.diskPercent,
					downloadPercent: entry.downloadPercent,
					uploadPercent: entry.uploadPercent,
					at: now,
				});
			}

			this._resourceMetricsTick.set(this._resourceMetricsTick.get() + 1, undefined);
		} finally {
			this._resourceSampleInFlight = false;
		}
	}

	private _readActivitySignals(sessionId: string, session: ISession | undefined): {
		modelActive: boolean;
		shellActive: boolean;
		gitOperationActive: boolean;
	} {
		if (!session) {
			return { modelActive: false, shellActive: false, gitOperationActive: false };
		}
		const status = session.status.get();
		const workspace = session.workspace.get();
		const gitRepo = workspace?.folders[0]?.gitRepository;
		let shellActive = false;
		try {
			const terminalContribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
			shellActive = terminalContribution.hasTrackedShellForSession(sessionId);
		} catch {
			// ignore
		}
		return {
			modelActive: status === SessionStatus.InProgress,
			shellActive,
			gitOperationActive: gitRepo?.hasGitOperationInProgress ?? false,
		};
	}

	private async _probeDroxCacheDir(session: ISession): Promise<boolean> {
		const folder = session.workspace.get()?.folders[0]?.workingDirectory;
		if (!folder) {
			return false;
		}
		try {
			return await this._fileService.exists(joinPath(folder, '.drox'));
		} catch {
			return false;
		}
	}

	private async _prepareSessionSwitch(from: IActiveSession | undefined, toResource: URI): Promise<'proceed' | 'cancel'> {
		if (!isDroxAgentsWindowEnabled(this._configurationService)) {
			return 'proceed';
		}
		this._prepareTerminalPolicyForSession(toResource);
		if (!from || from.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return 'proceed';
		}
		const toSession = this._sessionsManagementService.getSession(toResource);
		if (toSession?.providerId !== DROX_SESSIONS_PROVIDER_ID && toSession !== undefined) {
			return 'proceed';
		}
		if (from.sessionId === toSession?.sessionId) {
			return 'proceed';
		}

		if (this.isPersistent(from.sessionId)) {
			await this.suspendForegroundSession(from, { kill: false });
			return 'proceed';
		}

		if (!this._sessionHasForegroundWork(from)) {
			await this.suspendForegroundSession(from, { kill: true });
			return 'proceed';
		}

		const skipConfirm = this._storageService.getBoolean(DROX_SKIP_BACKGROUND_SWITCH_CONFIRM_KEY, StorageScope.PROFILE, false);
		if (!skipConfirm) {
			const confirmed = await this._dialogService.confirm({
				type: 'question',
				message: localize('drox.sessionSwitch.confirmTitle', "Leave this discussion?"),
				detail: localize(
					'drox.sessionSwitch.confirmDetail',
					"Shells and the agent response in progress will be stopped. Enable background persistence on the session card to keep them running.",
				),
				primaryButton: localize('drox.sessionSwitch.confirmPrimary', "Switch anyway"),
				cancelButton: localize('drox.sessionSwitch.confirmCancel', "Stay"),
				checkbox: {
					label: localize('drox.sessionSwitch.doNotAskAgain', "Do not ask me again"),
				},
			});
			if (!confirmed.confirmed) {
				return 'cancel';
			}
			if (confirmed.checkboxChecked) {
				this._storageService.store(DROX_SKIP_BACKGROUND_SWITCH_CONFIRM_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
			}
		}

		await this.suspendForegroundSession(from, { kill: true });
		return 'proceed';
	}

	private _prepareTerminalPolicyForSession(toResource: URI): void {
		const toSession = this._sessionsManagementService.getSession(toResource);
		if (!toSession || toSession.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		if (this.isPersistent(toSession.sessionId) && this._layoutSnapshots.has(toSession.sessionId)) {
			this._suppressTerminalEnsureSessionIds.delete(toSession.sessionId);
		} else {
			this._suppressTerminalEnsureSessionIds.add(toSession.sessionId);
		}
	}

	private _sessionHasForegroundWork(session: ISession): boolean {
		const status = session.status.get();
		if (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) {
			return true;
		}
		if (this._editorService.visibleEditors.length > 0) {
			return true;
		}
		try {
			const terminalContribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
			if (terminalContribution.getTrackedEditorTerminals(session.sessionId).length > 0) {
				return true;
			}
		} catch {
			// ignore
		}
		return false;
	}

	private async _killSessionRuntime(session: ISession): Promise<void> {
		await this._chatService.cancelCurrentRequestForSession(session.resource, 'drox.sessionSwitch');
		try {
			const terminalContribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
			await terminalContribution.killSessionTerminals(session.sessionId);
		} catch {
			// ignore
		}
	}

	private async _suspendSessionTerminals(sessionId: string): Promise<void> {
		try {
			const terminalContribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
			await terminalContribution.hideSessionTerminals(sessionId);
		} catch {
			// ignore
		}
	}

	private _forgetUpstreamLayout(session: ISession): void {
		try {
			const layoutController = getWorkbenchContribution<LayoutController>(LayoutController.ID);
			layoutController.forgetSessionLayout(session.resource);
		} catch {
			// ignore
		}
	}

	private _adoptSnapshotIntoLayoutController(sessionResource: URI, snapshot: IDroxSessionLayoutSnapshot): void {
		try {
			const layoutController = getWorkbenchContribution<LayoutController>(LayoutController.ID);
			layoutController.adoptEditorWorkingSet(sessionResource, snapshot.editorWorkingSet);
		} catch {
			// ignore
		}
	}

	/**
	 * Resolves when the workbench workspace folder matches the session's folder
	 * (or the session has no folder). Times out so cold start never hangs.
	 */
	private _whenWorkspaceMatchesSession(session: ISession): Promise<void> {
		const target = session.workspace.get()?.folders[0]?.workingDirectory;
		if (!target) {
			return Promise.resolve();
		}
		if (this._workspaceMatches(target)) {
			return Promise.resolve();
		}

		return new Promise<void>(resolve => {
			const timeout = setTimeout(() => {
				listener.dispose();
				resolve();
			}, 5000);
			const listener = this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
				if (this._workspaceMatches(target)) {
					clearTimeout(timeout);
					listener.dispose();
					resolve();
				}
			});
		});
	}

	private _workspaceMatches(target: URI): boolean {
		const current = this._workspaceContextService.getWorkspace().folders[0]?.uri;
		return !!current && this._uriIdentityService.extUri.isEqual(current, target);
	}

	private _replaceLayoutSnapshot(sessionId: string, snapshot: IDroxSessionLayoutSnapshot): void {
		const existing = this._layoutSnapshots.get(sessionId);
		this._layoutSnapshots.set(sessionId, snapshot);
		// Drop the previous working set only after the map points at the new one,
		// and never delete the working set we just adopted into LayoutController.
		if (existing?.editorWorkingSet && existing.editorWorkingSet !== snapshot.editorWorkingSet) {
			deleteDroxSessionLayoutSnapshot(existing, this._editorGroupsService);
		}
	}

	private _clearLayoutSnapshot(sessionId: string): void {
		const existing = this._layoutSnapshots.get(sessionId);
		this._layoutSnapshots.delete(sessionId);
		deleteDroxSessionLayoutSnapshot(existing, this._editorGroupsService);
	}

	private _findSessionById(sessionId: string): ISession | undefined {
		for (const session of this._sessionsManagementService.getSessions()) {
			if (session.sessionId === sessionId) {
				return session;
			}
		}
		return undefined;
	}
}

registerSingleton(IDroxSessionBackgroundService, DroxSessionBackgroundService, InstantiationType.Eager);
