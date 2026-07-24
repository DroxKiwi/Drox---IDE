/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../base/common/codicons.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../../sessions/browser/menus.js';
import { ActiveSessionContextKeys } from '../../../../sessions/contrib/changes/common/changes.js';
import { SessionHasChangesContext, SessionProviderIdContext, SessionHasGitSyncActionRunningContext, SessionWorkspaceIsVirtualContext } from '../../../../sessions/common/contextkeys.js';
import { IChat } from '../../../../sessions/services/sessions/common/session.js';
import { ISessionsService } from '../../../../sessions/services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../sessions/services/sessions/common/sessionsManagement.js';
import { IActiveSession } from '../../../../sessions/services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../sessions/services/sessions/common/session.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../common/droxAgentsSession.js';

export const DroxSessionGitComposerMenu = new MenuId('DroxSessionGitComposerMenu');

export const DROX_SESSION_COMMIT_ACTION_ID = 'workbench.action.droxSessions.commit';
export const DROX_SESSION_COMMIT_AND_PUSH_ACTION_ID = 'workbench.action.droxSessions.commitAndPush';
export const DROX_SESSION_CREATE_PR_ACTION_ID = 'workbench.action.droxSessions.createPullRequest';

/** Shared agent workflow — only the final step differs between Commit and Commit & Push. */
export function buildDroxCommitAgentPrompt(pushAfterCommit: boolean): string {
	const tail = pushAfterCommit
		? localize(
			'drox.git.commitPrompt.push',
			'Push the current branch to its remote (set upstream if the branch has no upstream yet).',
		)
		: localize(
			'drox.git.commitPrompt.noPush',
			'Do not push unless I explicitly ask.',
		);

	return `/commit

${localize('drox.git.commitPrompt.intro', 'Commit all uncommitted changes in this workspace:')}
- ${localize('drox.git.commitPrompt.status', 'Run `git status` and inspect the diff (`git diff` / `git diff --cached`).')}
- ${localize('drox.git.commitPrompt.log', 'Read recent commits (`git log --oneline -20`) and follow this repository\'s commit message style.')}
- ${localize('drox.git.commitPrompt.stage', 'Stage everything that should ship (`git add -A` when appropriate).')}
- ${localize('drox.git.commitPrompt.commit', 'Write a clear commit message and run `git commit`.')}
- ${localize('drox.git.commitPrompt.commitWindows', 'On Windows, avoid `git commit -m "..."` with nested quotes: write the message to a temp file and run `git commit -F <file>` (then delete the file).')}
- ${localize('drox.git.commitPrompt.verify', 'Confirm with `git status` and `git log -1`.')}
- ${tail}`;
}

/** Agent workflow to open or update a GitHub pull request via the `gh` CLI. */
export function buildDroxCreatePullRequestAgentPrompt(): string {
	return localize(
		'drox.git.createPrPrompt',
		`Create or update a GitHub pull request for the current branch using the GitHub CLI (\`gh\`):

- Verify \`gh\` is installed and authenticated (\`gh --version\`, \`gh auth status\`).
- Run \`git status\` and inspect the branch (\`git branch -vv\`).
- If there are uncommitted changes, commit them first (follow the repo's commit message style).
- Push the branch if it is not on the remote yet (\`git push -u origin HEAD\` when needed).
- If no open PR exists for this branch, run \`gh pr create\` with a clear title and body summarizing the changes.
- If a PR already exists, run \`gh pr view\` and share its URL; update the PR body if the branch changed materially.
- Do not merge the pull request unless I explicitly ask.`,
	);
}

export const droxSessionGitComposerWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	SessionProviderIdContext.isEqualTo(DROX_SESSIONS_PROVIDER_ID),
	ContextKeyExpr.or(
		ActiveSessionContextKeys.HasGitRepository,
		SessionWorkspaceIsVirtualContext.negate(),
	),
	ContextKeyExpr.or(
		ActiveSessionContextKeys.HasUncommittedChanges,
		SessionHasChangesContext,
	),
	SessionHasGitSyncActionRunningContext.negate(),
);

export const droxSessionGitComposerCreatePrWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	SessionProviderIdContext.isEqualTo(DROX_SESSIONS_PROVIDER_ID),
	ContextKeyExpr.or(
		ActiveSessionContextKeys.HasGitRepository,
		SessionWorkspaceIsVirtualContext.negate(),
	),
	ActiveSessionContextKeys.HasGitHubRemote,
	SessionHasGitSyncActionRunningContext.negate(),
	ContextKeyExpr.or(
		ActiveSessionContextKeys.HasUncommittedChanges,
		SessionHasChangesContext,
		ActiveSessionContextKeys.HasOutgoingChanges,
		ActiveSessionContextKeys.HasBranchChanges,
	),
);

interface ISessionSendContext {
	readonly session: ISession;
	readonly chat: IChat;
}

function resolveSessionSendContext(
	sessionsService: ISessionsService,
	sessionsManagementService: ISessionsManagementService,
	sessionArg: IActiveSession | ISession | URI | undefined,
): ISessionSendContext | undefined {
	let session: ISession | undefined;
	if (!sessionArg) {
		session = sessionsService.activeSession.get();
	} else if (URI.isUri(sessionArg)) {
		session = sessionsManagementService.getSession(sessionArg) ?? sessionsService.activeSession.get();
	} else {
		session = sessionArg;
	}
	if (!session) {
		return undefined;
	}

	const activeSession = sessionsService.activeSession.get();
	const chat = activeSession && isEqual(activeSession.resource, session.resource)
		? activeSession.activeChat.get()
		: session.mainChat.get();
	return { session, chat };
}

async function runDroxSessionGitPromptAction(
	accessor: ServicesAccessor,
	sessionArg: IActiveSession | ISession | URI | undefined,
	prompt: string,
	errorLogMessage: string,
	failureMessage: (err: unknown) => string,
	noSessionMessage: string,
): Promise<void> {
	const sessionsService = accessor.get(ISessionsService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);
	const chatWidgetService = accessor.get(IChatWidgetService);
	const logService = accessor.get(ILogService);
	const notificationService = accessor.get(INotificationService);

	const ctx = resolveSessionSendContext(sessionsService, sessionsManagementService, sessionArg);
	if (!ctx) {
		notificationService.notify({
			severity: Severity.Warning,
			message: noSessionMessage,
		});
		return;
	}

	try {
		await sessionsManagementService.sendRequest(ctx.session, ctx.chat, { query: prompt });
		chatWidgetService.getWidgetBySessionResource(ctx.chat.resource)?.focusInput();
	} catch (err) {
		logService.error(errorLogMessage, err);
		notificationService.notify({
			severity: Severity.Error,
			message: failureMessage(err),
		});
	}
}

async function runDroxSessionGitAction(
	accessor: ServicesAccessor,
	sessionArg: IActiveSession | ISession | URI | undefined,
	pushAfterCommit: boolean,
): Promise<void> {
	await runDroxSessionGitPromptAction(
		accessor,
		sessionArg,
		buildDroxCommitAgentPrompt(pushAfterCommit),
		'[DroxSessionGit] Failed to send commit agent request',
		err => localize('drox.git.sendFailed', "Could not start commit with the agent: {0}", String(err)),
		localize('drox.git.noActiveSession', "No active Drox session to commit changes for."),
	);
}

async function runDroxSessionCreatePullRequestAction(
	accessor: ServicesAccessor,
	sessionArg: IActiveSession | ISession | URI | undefined,
): Promise<void> {
	await runDroxSessionGitPromptAction(
		accessor,
		sessionArg,
		buildDroxCreatePullRequestAgentPrompt(),
		'[DroxSessionGit] Failed to send create PR agent request',
		err => localize('drox.git.createPrSendFailed', "Could not start pull request creation with the agent: {0}", String(err)),
		localize('drox.git.createPrNoActiveSession', "No active Drox session to create a pull request for."),
	);
}

registerAction2(class DroxSessionCommitAction extends Action2 {
	constructor() {
		super({
			id: DROX_SESSION_COMMIT_ACTION_ID,
			title: localize2('drox.git.commit', "Commit"),
			icon: Codicon.check,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession | ISession | URI): Promise<void> {
		await runDroxSessionGitAction(accessor, session, false);
	}
});

registerAction2(class DroxSessionCommitAndPushAction extends Action2 {
	constructor() {
		super({
			id: DROX_SESSION_COMMIT_AND_PUSH_ACTION_ID,
			title: localize2('drox.git.commitAndPush', "Commit & Push"),
			icon: Codicon.cloudUpload,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession | ISession | URI): Promise<void> {
		await runDroxSessionGitAction(accessor, session, true);
	}
});

registerAction2(class DroxSessionCreatePullRequestAction extends Action2 {
	constructor() {
		super({
			id: DROX_SESSION_CREATE_PR_ACTION_ID,
			title: localize2('drox.git.createPullRequest', "Create PR"),
			icon: Codicon.gitPullRequestCreate,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession | ISession | URI): Promise<void> {
		await runDroxSessionCreatePullRequestAction(accessor, session);
	}
});

MenuRegistry.appendMenuItem(DroxSessionGitComposerMenu, {
	command: { id: DROX_SESSION_COMMIT_ACTION_ID, title: localize2('drox.git.commit', "Commit"), icon: Codicon.check },
	group: 'navigation',
	order: 1,
});

MenuRegistry.appendMenuItem(DroxSessionGitComposerMenu, {
	command: { id: DROX_SESSION_COMMIT_AND_PUSH_ACTION_ID, title: localize2('drox.git.commitAndPush', "Commit & Push"), icon: Codicon.cloudUpload },
	group: 'navigation',
	order: 2,
});

MenuRegistry.appendMenuItem(DroxSessionGitComposerMenu, {
	command: { id: DROX_SESSION_CREATE_PR_ACTION_ID, title: localize2('drox.git.createPullRequest', "Create PR"), icon: Codicon.gitPullRequestCreate },
	group: 'navigation',
	order: 3,
	when: droxSessionGitComposerCreatePrWhen,
});

// Composer: direct pills (submenus do not forward the session arg reliably from ChatInputPart).
MenuRegistry.appendMenuItem(Menus.SessionComposerQuickActions, {
	command: { id: DROX_SESSION_COMMIT_ACTION_ID, title: localize2('drox.git.commit', "Commit"), icon: Codicon.check },
	group: 'navigation',
	order: 5,
	when: droxSessionGitComposerWhen,
});

MenuRegistry.appendMenuItem(Menus.SessionComposerQuickActions, {
	command: { id: DROX_SESSION_COMMIT_AND_PUSH_ACTION_ID, title: localize2('drox.git.commitAndPush', "Commit & Push"), icon: Codicon.cloudUpload },
	group: 'navigation',
	order: 6,
	when: droxSessionGitComposerWhen,
});

MenuRegistry.appendMenuItem(Menus.SessionComposerQuickActions, {
	command: { id: DROX_SESSION_CREATE_PR_ACTION_ID, title: localize2('drox.git.createPullRequest', "Create PR"), icon: Codicon.gitPullRequestCreate },
	group: 'navigation',
	order: 7,
	when: droxSessionGitComposerCreatePrWhen,
});

MenuRegistry.appendMenuItem(MenuId.AgentsChangesToolbar, {
	submenu: DroxSessionGitComposerMenu,
	title: localize2('drox.git.commitAndPush', "Commit & Push"),
	icon: Codicon.cloudUpload,
	group: 'navigation',
	order: 5,
	when: droxSessionGitComposerWhen,
});

// Legacy header meta row (non-Drox providers keep using SessionHeaderMeta).
MenuRegistry.appendMenuItem(Menus.SessionHeaderMeta, {
	submenu: DroxSessionGitComposerMenu,
	title: localize2('drox.git.commitAndPush', "Commit & Push"),
	icon: Codicon.cloudUpload,
	group: 'navigation',
	order: 5,
	when: ContextKeyExpr.and(
		droxSessionGitComposerWhen,
		SessionProviderIdContext.isEqualTo(DROX_SESSIONS_PROVIDER_ID).negate(),
	),
});
