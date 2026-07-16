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
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { SessionIsArchivedContext, SessionProviderIdContext } from '../../../common/contextkeys.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { SessionItemContextMenuId, SessionItemToolbarMenuId } from '../../sessions/browser/views/sessionsList.js';
import { IDroxSessionBackgroundService } from '../common/droxSessionBackgroundService.js';

export const DroxSessionBackgroundPersistentContext = new RawContextKey<boolean>('droxSessionBackgroundPersistent', false);

const isDroxSession = ContextKeyExpr.equals(SessionProviderIdContext.key, DROX_SESSIONS_PROVIDER_ID);

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
