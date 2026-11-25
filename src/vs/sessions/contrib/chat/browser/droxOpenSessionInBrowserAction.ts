/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { logSessionsInteraction } from '../../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsTasksService } from './sessionsTasksService.js';

/** Title bar shortcut for integrated browser (alongside terminal toggle). */
export const OPEN_SESSION_IN_BROWSER_ACTION_ID = 'agentSession.openInBrowser';

class OpenSessionInBrowserAction extends Action2 {

	constructor() {
		super({
			id: OPEN_SESSION_IN_BROWSER_ACTION_ID,
			title: localize2('openInBrowser', "Open in Browser"),
			tooltip: localize('openInBrowserTitleBarTooltip', "Open in the integrated browser"),
			icon: Codicon.globe,
			menu: [{
				id: AgentsWindowMenus.TitleBarSessionMenu,
				group: 'navigation',
				order: 11,
				when: ContextKeyExpr.and(
					IsAuxiliaryWindowContext.toNegated(),
					SessionsWelcomeVisibleContext.toNegated(),
					IsPhoneLayoutContext.negate(),
				),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const telemetryService = accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openBrowser', 'titleBar');

		const sessionsService = accessor.get(ISessionsService);
		const sessionsTasksService = accessor.get(ISessionsTasksService);
		const commandService = accessor.get(ICommandService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		const activeSession = sessionsService.activePane.get()?.session.get();
		const folder = activeSession?.workspace.get()?.folders[0];
		const browserUrl = sessionsTasksService.getBrowserUrl(folder?.root).get();

		layoutService.setPartHidden(false, Parts.EDITOR_PART);
		if (browserUrl) {
			await commandService.executeCommand(BrowserViewCommandId.Open, browserUrl);
		} else {
			await commandService.executeCommand(BrowserViewCommandId.NewTab);
		}
	}
}

registerAction2(OpenSessionInBrowserAction);
