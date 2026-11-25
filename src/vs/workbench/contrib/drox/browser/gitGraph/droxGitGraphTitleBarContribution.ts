/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IsAuxiliaryWindowContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Menus } from '../../../../../sessions/browser/menus.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../../../sessions/common/contextkeys.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { DROX_GIT_GRAPH_OPEN_COMMAND_ID, IDroxGitGraphService } from '../../common/droxGitGraphService.js';

/** True when the active session folder is a git repo with a current branch. */
export const DroxGitGraphBranchAvailableContext = new RawContextKey<boolean>(
	'drox.gitGraph.branchAvailable',
	false,
	localize('drox.gitGraph.branchAvailable', "Whether the active session has a git branch available for Git Graph"),
);

const DROX_GIT_GRAPH_TITLE_BAR_ACTION_ID = 'drox.gitGraph.openTitleBar';

function resolveSessionFolder(sessionsService: ISessionsService): URI | undefined {
	const session = sessionsService.activeSession.get();
	const folder = session?.workspace.get()?.folders[0];
	if (!folder) {
		return undefined;
	}
	const uri = folder.workingDirectory ?? folder.root;
	return uri?.scheme === Schemas.file ? uri : undefined;
}

class OpenGitGraphTitleBarAction extends Action2 {
	constructor() {
		super({
			id: DROX_GIT_GRAPH_TITLE_BAR_ACTION_ID,
			title: localize2('drox.gitGraph.titleBar', "Git Graph"),
			tooltip: localize('drox.gitGraph.titleBarTooltip', "Open Git Graph"),
			icon: Codicon.gitBranch,
			precondition: DroxGitGraphBranchAvailableContext,
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 9,
				when: ContextKeyExpr.and(
					IsAuxiliaryWindowContext.toNegated(),
					SessionsWelcomeVisibleContext.toNegated(),
					IsPhoneLayoutContext.negate(),
				),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const commandService = accessor.get(ICommandService);
		const folder = resolveSessionFolder(sessionsService);
		await commandService.executeCommand(DROX_GIT_GRAPH_OPEN_COMMAND_ID, folder);
	}
}

registerAction2(OpenGitGraphTitleBarAction);

/**
 * Keeps {@link DroxGitGraphBranchAvailableContext} in sync with the active session folder.
 * Icon stays visible but disabled when no branch is available.
 */
class DroxGitGraphTitleBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.drox.gitGraphTitleBar';

	private readonly _available: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IDroxGitGraphService private readonly _gitGraphService: IDroxGitGraphService,
	) {
		super();
		this._available = DroxGitGraphBranchAvailableContext.bindTo(contextKeyService);

		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			const workspace = session?.workspace.read(reader);
			const folder = workspace?.folders[0];
			const uri = folder ? (folder.workingDirectory ?? folder.root) : undefined;
			if (!uri || uri.scheme !== Schemas.file) {
				this._available.set(false);
				return;
			}

			const isRepo = this._gitGraphService.isGitRepo(uri).read(reader);
			const branch = this._gitGraphService.currentBranch(uri).read(reader);
			this._available.set(!!isRepo && !!branch);
		}));
	}
}

registerWorkbenchContribution2(DroxGitGraphTitleBarContribution.ID, DroxGitGraphTitleBarContribution, WorkbenchPhase.AfterRestored);
