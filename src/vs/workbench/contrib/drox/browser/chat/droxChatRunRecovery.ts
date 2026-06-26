/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IDroxAgentRunImage } from '../../common/droxAttachments.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { droxWorkspaceSessionsDir } from '../../common/droxWorkspacePaths.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { truncateUserPromptForEngine } from '../../common/droxUserPromptEngine.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxChatSendRunHost } from './droxChatSendRun.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

export interface IDroxPendingRunRecovery {
	readonly messageId: string;
	readonly mode: string;
	readonly enginePrompt: string;
	readonly images?: readonly IDroxAgentRunImage[];
}

const pendingBySession = new Map<string, IDroxPendingRunRecovery>();

export function setPendingRunRecovery(sessionId: string, ctx: IDroxPendingRunRecovery): void {
	pendingBySession.set(sessionId, ctx);
}

export function clearPendingRunRecovery(sessionId: string | undefined): void {
	if (sessionId) {
		pendingBySession.delete(sessionId);
	}
}

export function getPendingRunRecovery(sessionId: string | undefined): IDroxPendingRunRecovery | undefined {
	if (!sessionId) {
		return undefined;
	}
	return pendingBySession.get(sessionId);
}

export function offerRunRecoveryAfterError(
	post: (message: DroxHostToWebviewMessage) => void,
	sessionId: string | undefined,
): void {
	const pending = getPendingRunRecovery(sessionId);
	if (!pending) {
		return;
	}
	post({ kind: 'runRecoveryOffer', messageId: pending.messageId });
}

async function startRecoveryRun(
	host: IDroxChatSendRunHost,
	tabs: DroxChatTabsManager,
	deps: {
		readonly userAskService: IDroxUserAskService;
		readonly clientToolsService: IDroxClientToolsService;
		readonly runSettingsService: IDroxRunSettingsService;
		readonly droxEngineService: IDroxEngineService;
		readonly logService: ILogService;
		readonly runRevertService: IDroxRunRevertService;
	},
	ctx: IDroxPendingRunRecovery,
	restart: boolean,
): Promise<void> {
	if (host.isRunActive()) {
		deps.logService.warn('[Drox] run recovery ignored — run already active');
		return;
	}
	const ws = host.workspaceRoot();
	const sessionId = tabs.currentSessionId;
	if (!ws || !sessionId) {
		return;
	}
	if (deps.userAskService.hasPending) {
		return;
	}

	host.post({ kind: 'runRecoveryDismiss' });
	host.setPendingRunStart(true);
	host.post({ kind: 'state', busy: true });
	host.post({ kind: 'clearAssistant' });

	try {
		if (restart) {
			await deps.droxEngineService.request('session.truncateAfterLastUser', {
				id: sessionId,
				dir: droxWorkspaceSessionsDir(ws),
			});
			host.post({ kind: 'runRecoveryClearAfter', messageId: ctx.messageId });
		}

		const allTools = deps.clientToolsService.executableToolNames;
		const executableTools = deps.runSettingsService.filterExecutableTools(allTools);
		await deps.droxEngineService.initialize({
			executableTools: [...executableTools],
			interactiveAsk: true,
		});
		const runParams = deps.runSettingsService.buildAgentRunParams({
			prompt: truncateUserPromptForEngine(ctx.enginePrompt) || '.',
			workspace: ws,
			mode: ctx.mode,
			sessionId,
			images: ctx.images && ctx.images.length > 0 ? [...ctx.images] : undefined,
			skipUserTurn: true,
		});
		const result = await deps.droxEngineService.request('agent.run', runParams) as { runId?: string };
		if (typeof result?.runId === 'string') {
			host.setPendingRunStart(false);
			host.setCurrentRunId(result.runId);
			host.syncChatSessionState();
			deps.runRevertService.beginRun(result.runId, ws, sessionId);
			deps.runRevertService.setRunFirstMessageId(result.runId, ctx.messageId);
			deps.logService.info(`[Drox] agent.run recovery (${restart ? 'restart' : 'resume'})`, result.runId);
		} else {
			host.setPendingRunStart(false);
			host.post({ kind: 'state', busy: false });
		}
	} catch (e) {
		host.setPendingRunStart(false);
		host.setCurrentRunId(undefined);
		host.syncChatSessionState();
		const text = e instanceof Error ? e.message : String(e);
		deps.logService.error('[Drox] run recovery failed', e);
		host.post({ kind: 'append', role: 'error', text });
		host.post({ kind: 'state', busy: false });
		offerRunRecoveryAfterError(host.post.bind(host), sessionId);
	}
}

export async function handleDroxResumeRunAfterError(
	host: IDroxChatSendRunHost,
	tabs: DroxChatTabsManager,
	deps: {
		readonly userAskService: IDroxUserAskService;
		readonly notificationService: INotificationService;
		readonly clientToolsService: IDroxClientToolsService;
		readonly runSettingsService: IDroxRunSettingsService;
		readonly droxEngineService: IDroxEngineService;
		readonly logService: ILogService;
		readonly runRevertService: IDroxRunRevertService;
	},
	messageId: string,
): Promise<void> {
	const ctx = getPendingRunRecovery(tabs.currentSessionId);
	if (!ctx || ctx.messageId !== messageId) {
		host.post({
			kind: 'append',
			role: 'system',
			text: localize('drox.runRecovery.unavailable', 'Cannot resume this run anymore.'),
		});
		return;
	}
	await startRecoveryRun(host, tabs, deps, ctx, false);
}

export async function handleDroxRestartRunAfterError(
	host: IDroxChatSendRunHost,
	tabs: DroxChatTabsManager,
	deps: {
		readonly userAskService: IDroxUserAskService;
		readonly notificationService: INotificationService;
		readonly clientToolsService: IDroxClientToolsService;
		readonly runSettingsService: IDroxRunSettingsService;
		readonly droxEngineService: IDroxEngineService;
		readonly logService: ILogService;
		readonly runRevertService: IDroxRunRevertService;
	},
	messageId: string,
): Promise<void> {
	const ctx = getPendingRunRecovery(tabs.currentSessionId);
	if (!ctx || ctx.messageId !== messageId) {
		host.post({
			kind: 'append',
			role: 'system',
			text: localize('drox.runRecovery.unavailable', 'Cannot resume this run anymore.'),
		});
		return;
	}
	await startRecoveryRun(host, tabs, deps, ctx, true);
}
