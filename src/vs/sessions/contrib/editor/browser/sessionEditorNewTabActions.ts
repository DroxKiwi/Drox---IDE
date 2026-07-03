/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { getWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsTasksService } from '../../chat/browser/sessionsTasksService.js';
import { SessionsTerminalContribution } from '../../terminal/browser/sessionsTerminalContribution.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';

/** Submenu for the editor-tab "+" control (Cursor-like new page menu). */
export const SessionEditorNewTabMenu = new MenuId('SessionEditorNewTabMenu');

const SESSION_NEW_EDITOR_TAB_FILE_ACTION_ID = 'workbench.action.agentSessions.newEditorTab.file';
const SESSION_NEW_EDITOR_TAB_TERMINAL_ACTION_ID = 'workbench.action.agentSessions.newEditorTab.terminal';
const SESSION_NEW_EDITOR_TAB_BROWSER_ACTION_ID = 'workbench.action.agentSessions.newEditorTab.browser';
const SESSION_NEW_EDITOR_TAB_CHANGES_ACTION_ID = 'workbench.action.agentSessions.newEditorTab.changes';

const sessionEditorNewTabWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext,
	SessionsWelcomeVisibleContext.toNegated(),
);

const revealEditorPart = (layoutService: IAgentWorkbenchLayoutService): void => {
	layoutService.setPartHidden(false, Parts.EDITOR_PART);
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SESSION_NEW_EDITOR_TAB_FILE_ACTION_ID,
			title: localize2('sessionNewEditorTabFile', "File"),
			icon: Codicon.file,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		revealEditorPart(layoutService);
		await commandService.executeCommand('workbench.action.quickOpen');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SESSION_NEW_EDITOR_TAB_TERMINAL_ACTION_ID,
			title: localize2('sessionNewEditorTabTerminal', "Terminal"),
			icon: Codicon.terminal,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.openNewTerminal(sessionsService.activeSession.get());
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SESSION_NEW_EDITOR_TAB_BROWSER_ACTION_ID,
			title: localize2('sessionNewEditorTabBrowser', "Browser"),
			icon: Codicon.globe,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionsTasksService = accessor.get(ISessionsTasksService);

		revealEditorPart(layoutService);

		const activeSession = sessionsService.activeSession.get();
		const folder = activeSession?.workspace.get()?.folders[0];
		const browserUrl = sessionsTasksService.getBrowserUrl(folder?.root).get();
		if (browserUrl) {
			await commandService.executeCommand(BrowserViewCommandId.Open, browserUrl);
		} else {
			await commandService.executeCommand(BrowserViewCommandId.NewTab);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SESSION_NEW_EDITOR_TAB_CHANGES_ACTION_ID,
			title: localize2('sessionNewEditorTabChanges', "Changes"),
			icon: Codicon.diffMultiple,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);

		layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await viewsService.openView(CHANGES_VIEW_ID, true);
	}
});

MenuRegistry.appendMenuItem(SessionEditorNewTabMenu, {
	command: { id: SESSION_NEW_EDITOR_TAB_FILE_ACTION_ID, title: localize2('sessionNewEditorTabFile', "File"), icon: Codicon.file },
	group: 'navigation',
	order: 1,
});

MenuRegistry.appendMenuItem(SessionEditorNewTabMenu, {
	command: { id: SESSION_NEW_EDITOR_TAB_TERMINAL_ACTION_ID, title: localize2('sessionNewEditorTabTerminal', "Terminal"), icon: Codicon.terminal },
	group: 'navigation',
	order: 2,
});

MenuRegistry.appendMenuItem(SessionEditorNewTabMenu, {
	command: { id: SESSION_NEW_EDITOR_TAB_BROWSER_ACTION_ID, title: localize2('sessionNewEditorTabBrowser', "Browser"), icon: Codicon.globe },
	group: 'navigation',
	order: 3,
});

MenuRegistry.appendMenuItem(SessionEditorNewTabMenu, {
	command: { id: SESSION_NEW_EDITOR_TAB_CHANGES_ACTION_ID, title: localize2('sessionNewEditorTabChanges', "Changes"), icon: Codicon.diffMultiple },
	group: 'navigation',
	order: 4,
});

MenuRegistry.appendMenuItem(MenuId.EditorTitleLayout, {
	submenu: SessionEditorNewTabMenu,
	title: localize2('sessionEditorNewTab', "New Tab"),
	icon: Codicon.add,
	group: 'navigation',
	order: 0,
	when: sessionEditorNewTabWhen,
});
