/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SessionsView, SessionsViewId as SessionsListViewId } from '../../sessions/browser/views/sessionsView.js';
import { ISessionsSetUpService } from '../../../browser/sessionsSetUpService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';

class SelectAgentsFolderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.selectAgentsFolder';

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ISessionsSetUpService private readonly sessionsSetUpService: ISessionsSetUpService,
		@ILogService private readonly logService: ILogService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
	) {
		super();
		const handleSelectAgentsFolder = (_: unknown, ...args: unknown[]) => {
			const folderUri = args[0] ? URI.revive(args[0] as UriComponents) : undefined;
			const sessionResource = args[1] ? URI.revive(args[1] as UriComponents) : undefined;
			this.logService.info(`[AgentsHandoff] IPC received: folderUri=${folderUri?.toString() ?? '(none)'} sessionResource=${sessionResource?.toString() ?? '(none)'}`);

			this.handleOpenIntent(folderUri, sessionResource)
				.catch(err => this.logService.error('[AgentsHandoff] handleOpenIntent failed', err));
		};
		ipcRenderer.on('vscode:selectAgentsFolder', handleSelectAgentsFolder);
		this._register({ dispose: () => ipcRenderer.removeListener('vscode:selectAgentsFolder', handleSelectAgentsFolder) });
	}

	private async handleOpenIntent(folderUri: URI | undefined, sessionResource: URI | undefined): Promise<void> {
		// Opening an existing session establishes its own workspace context, so
		// the folder selection is only needed for the folder-only handoff (no
		// session to restore).
		if (sessionResource) {
			await this.openExistingSession(sessionResource);
			if (!this.sessionsManagementService.getSession(sessionResource) && folderUri) {
				this.logService.warn(`[AgentsHandoff] session not found after open; falling back to folder handoff`);
				await this.selectFolder(folderUri);
			}
			return;
		}
		if (folderUri) {
			await this.selectFolder(folderUri);
		}
	}

	private async openExistingSession(sessionResource: URI): Promise<void> {
		this.logService.info(`[AgentsHandoff] openExistingSession: target=${sessionResource.toString()}`);

		// Wait for the workbench to be ready so the session list / providers
		// have populated. Otherwise openSession can't find the session.
		await this.lifecycleService.when(LifecyclePhase.Eventually);
		this.logService.info('[AgentsHandoff] reached LifecyclePhase.Eventually');

		// Fast path — already on the target session.
		const current = this.sessionsService.activeSession.get();
		if (current && current.resource.toString() === sessionResource.toString()) {
			this.logService.info('[AgentsHandoff] already on target session');
			return;
		}

		// Show the sessions part's progress bar while we wait for the session to
		// appear in the providers and open it, so the window doesn't just sit on
		// its restored state until the target session pops in.
		await this.sessionsPartService.getProgressIndicator().showWhile(this.resolveAndOpenSession(sessionResource));
	}

	private async resolveAndOpenSession(sessionResource: URI): Promise<void> {
		// The Copilot Chat Sessions Provider lists sessions asynchronously
		// via an RPC; the target session may not yet be in the providers'
		// `getSessions()` map. Poll until it shows up.
		const found = await this.waitForSessionAvailable(sessionResource);
		if (!found) {
			this.logService.warn(`[AgentsHandoff] target session never appeared in providers; aborting`);
			return;
		}
		this.logService.info('[AgentsHandoff] target session available; opening');

		// `openSession` cancels any in-flight restore before activating the
		// target, so a single call wins the race — no retry/verify needed.
		await this.sessionsService.openSession(sessionResource);
	}

	private async waitForSessionAvailable(sessionResource: URI, timeoutMs = 15_000): Promise<boolean> {
		if (this.sessionsManagementService.getSession(sessionResource)) {
			return true;
		}

		// wait for session to become available
		return new Promise<boolean>(resolve => {
			const store = new DisposableStore();
			const done = (result: boolean) => {
				store.dispose();
				resolve(result);
			};
			const timer = setTimeout(() => done(!!this.sessionsManagementService.getSession(sessionResource)), timeoutMs);
			store.add({ dispose: () => clearTimeout(timer) });
			store.add(this.sessionsManagementService.onDidChangeSessions(() => {
				if (this.sessionsManagementService.getSession(sessionResource)) {
					done(true);
				}
			}));
		});
	}

	private async selectFolder(folderUri: URI): Promise<void> {
		await this.sessionsSetUpService.whenWelcomeDone();
		await this.lifecycleService.when(LifecyclePhase.Eventually);

		const sessionsView = this.viewsService.getViewWithId<SessionsView>(SessionsListViewId);
		sessionsView?.sessionsControl?.setOpenWindowSourceFolder(folderUri);

		const resolved = await this.waitForWorkspaceResolution(folderUri);
		if (!resolved) {
			this.logService.warn(`[AgentsHandoff] no provider can resolve folder ${folderUri.toString()}`);
			return;
		}

		// Create a concrete draft session for the folder. This cancels any
		// in-flight grid restore and wins the race against a stale active slot.
		const session = this.sessionsService.openNewSession({
			folderUri,
			providerId: resolved.providerId,
		});
		if (session) {
			this.logService.info(`[AgentsHandoff] opened new session for folder provider=${resolved.providerId}`);
			return;
		}

		// Fallback: composer view + workspace picker when createNewSession failed.
		this.sessionsService.openNewSession();
		const activeSession = this.sessionsService.activeSession.get();
		this.sessionsPartService.getSessionView(activeSession?.sessionId)?.selectWorkspace(folderUri, resolved.providerId);
	}

	private waitForWorkspaceResolution(folderUri: URI): Promise<{ providerId: string } | undefined> {
		const immediate = this.sessionsManagementService.resolveWorkspace(folderUri);
		if (immediate) {
			return Promise.resolve(immediate);
		}

		return new Promise(resolve => {
			const store = new DisposableStore();
			const done = (result: { providerId: string } | undefined) => {
				store.dispose();
				resolve(result);
			};
			const timer = setTimeout(() => done(this.sessionsManagementService.resolveWorkspace(folderUri)), 15_000);
			store.add({ dispose: () => clearTimeout(timer) });
			store.add(this.sessionsProvidersService.onDidChangeProviders(() => {
				const resolved = this.sessionsManagementService.resolveWorkspace(folderUri);
				if (resolved) {
					done(resolved);
				}
			}));
			void this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
				done(this.sessionsManagementService.resolveWorkspace(folderUri));
			});
		});
	}
}

registerWorkbenchContribution2(SelectAgentsFolderContribution.ID, SelectAgentsFolderContribution, WorkbenchPhase.BlockStartup);
