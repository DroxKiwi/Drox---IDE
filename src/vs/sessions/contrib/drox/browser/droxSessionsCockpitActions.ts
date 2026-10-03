/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { openDroxCodebaseCockpit, openDroxPortsView, openDroxRegulationView, openDroxTrafficView } from '../../../../workbench/contrib/drox/browser/droxOpenWorkbenchViews.js';
import { IDroxCodebaseSupervisionService } from '../../../../workbench/contrib/drox/common/codebase/droxCodebaseSupervisionService.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { IDroxRunSettingsService } from '../../../../workbench/contrib/drox/common/droxRunSettingsService.js';
import { IDroxRegulationService } from '../../../../workbench/contrib/drox/common/regulation/droxRegulationServiceContract.js';
import { SessionIsArchivedContext, SessionProviderIdContext } from '../../../common/contextkeys.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { SessionItemContextMenuId, SessionItemToolbarMenuId } from '../../sessions/browser/views/sessionsList.js';

const isDroxSession = ContextKeyExpr.equals(SessionProviderIdContext.key, DROX_SESSIONS_PROVIDER_ID);

function resolveSessionRoot(session: ISession): URI | undefined {
	const folder = session.workspace.get()?.folders[0];
	return folder?.workingDirectory ?? folder?.root;
}

function applySessionRoot(
	accessor: ServicesAccessor,
	session: ISession,
): URI | undefined {
	const root = resolveSessionRoot(session);
	accessor.get(IDroxCodebaseSupervisionService).setActiveRoot(root);
	accessor.get(IDroxRunSettingsService).setActiveWorkspaceResource(root);
	return root;
}

registerAction2(class DroxOpenSessionCodebaseAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.openCodebase',
			title: localize2('drox.openSessionCodebase', "Codebase"),
			tooltip: localize('drox.openSessionCodebase.tooltip', "Open @Codebase cockpit for this discussion's folder"),
			icon: Codicon.database,
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
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		applySessionRoot(accessor, session);
		await openDroxCodebaseCockpit({
			viewsService,
			layoutService,
			environmentService,
		});
	}
});

registerAction2(class DroxOpenSessionRegulationAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.openRegulation',
			title: localize2('drox.openSessionRegulation', "Regulation"),
			tooltip: localize('drox.openSessionRegulation.tooltip', "Open model regulation for this discussion's folder"),
			icon: Codicon.graphLine,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 5,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 3,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const regulationService = accessor.get(IDroxRegulationService);
		const root = applySessionRoot(accessor, session);
		// Open first — never block the shortcut on history IO.
		await openDroxRegulationView({
			viewsService,
			layoutService,
			environmentService,
		});
		if (root) {
			void regulationService.ensureHistoryLoaded(root.fsPath).catch(() => { /* best-effort */ });
		}
	}
});

registerAction2(class DroxOpenSessionTrafficAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.openTraffic',
			title: localize2('drox.openSessionTraffic', "Traffic"),
			tooltip: localize('drox.openSessionTraffic.tooltip', "Open traffic observatory for this discussion's folder"),
			icon: Codicon.radioTower,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 6,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 4,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		applySessionRoot(accessor, session);
		await openDroxTrafficView({
			viewsService,
			layoutService,
			environmentService,
		});
	}
});

registerAction2(class DroxOpenSessionPortsAction extends Action2 {
	constructor() {
		super({
			id: 'drox.sessions.openPorts',
			title: localize2('drox.openSessionPorts', "Ports"),
			tooltip: localize('drox.openSessionPorts.tooltip', "Open declarative port forwards for this discussion's folder"),
			icon: Codicon.plug,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 7,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 5,
				when: ContextKeyExpr.and(isDroxSession, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
			return;
		}
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		applySessionRoot(accessor, session);
		await openDroxPortsView({
			viewsService,
			layoutService,
			environmentService,
		});
	}
});
