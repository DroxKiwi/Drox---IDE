/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IEditorService, MODAL_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { DROX_SESSIONS_PROVIDER_ID, DroxChatSessionUri } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { ensureDroxSessionNotesFile } from '../../../../workbench/contrib/drox/common/droxSessionNotesFs.js';
import { SessionIsArchivedContext, SessionProviderIdContext } from '../../../common/contextkeys.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { SessionItemContextMenuId, SessionItemToolbarMenuId } from '../../sessions/browser/views/sessionsList.js';
import { IDroxSessionBackgroundService } from '../common/droxSessionBackgroundService.js';

export const DroxSessionBackgroundPersistentContext = new RawContextKey<boolean>('droxSessionBackgroundPersistent', false);

const isDroxSession = ContextKeyExpr.equals(SessionProviderIdContext.key, DROX_SESSIONS_PROVIDER_ID);

function droxEngineSessionKey(session: ISession): string {
	return DroxChatSessionUri.parseSessionId(session.resource) ?? session.sessionId;
}

registerAction2(class DroxToggleBackgroundPersistAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.toggleBackgroundPersist',
			title: localize2('drox.toggleBackgroundPersist', "Keep Running in Background"),
			tooltip: localize('drox.toggleBackgroundPersist.off', "Enable background persistence — shells and agent runs continue when you switch discussions"),
			// Square (debug-stop) = persistence ON; continue = OFF (arm to keep running).
			icon: Codicon.debugContinue,
			toggled: {
				condition: DroxSessionBackgroundPersistentContext,
				icon: Codicon.debugStop,
				tooltip: localize('drox.toggleBackgroundPersist.on', "Background persistence enabled — disable to stop runs when switching discussions"),
			},
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: -1,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const backgroundService = accessor.get(IDroxSessionBackgroundService);
		backgroundService.setPersistent(session.sessionId, !backgroundService.isPersistent(session.sessionId));
	}
});

export const DroxSessionAllowOutsideWorkspaceContext = new RawContextKey<boolean>('droxSessionAllowOutsideWorkspace', false);
export const DroxSessionAllowOutsideWorkspaceReadContext = new RawContextKey<boolean>('droxSessionAllowOutsideWorkspaceRead', false);
export const DroxSessionAllowOutsideWorkspaceWriteContext = new RawContextKey<boolean>('droxSessionAllowOutsideWorkspaceWrite', false);

registerAction2(class DroxToggleAllowOutsideWorkspaceReadAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.toggleAllowOutsideWorkspaceRead',
			title: localize2('drox.toggleAllowOutsideWorkspaceRead', "Allow Outside Workspace Read"),
			tooltip: localize('drox.toggleAllowOutsideWorkspaceRead.off', "Enable read/inventory outside this folder — glob, grep, and Explore inventaire"),
			icon: Codicon.eye,
			toggled: {
				condition: DroxSessionAllowOutsideWorkspaceReadContext,
				icon: Codicon.eyeClosed,
				tooltip: localize('drox.toggleAllowOutsideWorkspaceRead.on', "Outside-workspace read enabled — disable to confine inventory to this folder"),
			},
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const backgroundService = accessor.get(IDroxSessionBackgroundService);
		const key = droxEngineSessionKey(session);
		backgroundService.setAllowOutsideWorkspaceRead(
			key,
			!backgroundService.isAllowOutsideWorkspaceRead(key),
		);
	}
});

registerAction2(class DroxToggleAllowOutsideWorkspaceWriteAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.toggleAllowOutsideWorkspaceWrite',
			title: localize2('drox.toggleAllowOutsideWorkspaceWrite', "Allow Outside Workspace Write"),
			tooltip: localize('drox.toggleAllowOutsideWorkspaceWrite.off', "Enable writes outside this folder — file edit/write, delete, copy, bash"),
			icon: Codicon.lock,
			toggled: {
				condition: DroxSessionAllowOutsideWorkspaceWriteContext,
				icon: Codicon.unlock,
				tooltip: localize('drox.toggleAllowOutsideWorkspaceWrite.on', "Outside-workspace write enabled — disable to confine mutations to this folder"),
			},
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 1,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const backgroundService = accessor.get(IDroxSessionBackgroundService);
		const key = droxEngineSessionKey(session);
		backgroundService.setAllowOutsideWorkspaceWrite(
			key,
			!backgroundService.isAllowOutsideWorkspaceWrite(key),
		);
	}
});

/** @deprecated Kept for keybindings that still reference the old combined toggle. */
registerAction2(class DroxToggleAllowOutsideWorkspaceAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.toggleAllowOutsideWorkspace',
			title: localize2('drox.toggleAllowOutsideWorkspace', "Allow Outside Workspace"),
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const backgroundService = accessor.get(IDroxSessionBackgroundService);
		const key = droxEngineSessionKey(session);
		const next = !backgroundService.isAllowOutsideWorkspace(key);
		backgroundService.setAllowOutsideWorkspace(key, next);
	}
});

registerAction2(class DroxOpenSessionNotesAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.openSessionNotes',
			title: localize2('drox.openSessionNotes', "Session Notes"),
			tooltip: localize('drox.openSessionNotes.tooltip', "Open the markdown notepad for this discussion"),
			icon: Codicon.note,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 2,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const engineSessionId = droxEngineSessionKey(session);
		const workspacePath = session.workspace.get()?.folders[0]?.workingDirectory?.fsPath;
		if (!workspacePath || !engineSessionId.startsWith('ses_')) {
			return;
		}
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const uri = await ensureDroxSessionNotesFile(fileService, workspacePath, engineSessionId);
		if (!uri) {
			return;
		}
		await editorService.openEditor({
			resource: uri,
			options: { pinned: true },
		}, MODAL_GROUP);
	}
});

class DroxSessionBackgroundBootstrapContribution implements IWorkbenchContribution {
	static readonly ID = 'drox.sessionsBackgroundBootstrap';

	constructor(@IDroxSessionBackgroundService _backgroundService: IDroxSessionBackgroundService) {
		// Side-effect: register open gates in service constructor.
	}
}

registerWorkbenchContribution2(
	DroxSessionBackgroundBootstrapContribution.ID,
	DroxSessionBackgroundBootstrapContribution,
	WorkbenchPhase.BlockStartup,
);
