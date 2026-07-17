/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IDroxAgentRunImage } from '../../common/droxAttachments.js';
import { cancelDroxAgentRun, IDroxAgentRunBridgeDeps, startDroxAgentRun } from '../../common/droxAgentRunBridge.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import {
	buildEnginePromptFromLastUserTranscript,
	findLastUserMessageIdInUiReplay,
} from '../../common/droxRunRecoveryPersist.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { IDroxTranscriptMessage } from '../../common/droxSession.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { droxWorkspaceSessionsDir } from '../../common/droxWorkspacePaths.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxChatSendRunHost } from './droxChatSendRun.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';
import { IDroxSessionBackgroundService } from '../../../../../sessions/contrib/drox/common/droxSessionBackgroundService.js';

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

export async function persistPendingRunRecovery(
	sessionService: IDroxSessionService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<void> {
	const ctx = getPendingRunRecovery(sessionId);
	if (!ctx) {
		return;
	}
	await sessionService.writeRunRecovery(sessionId, workspaceFsPath, ctx);
}

export interface IDroxRunRecoveryRestoreContext {
	readonly transcriptMessages: readonly IDroxTranscriptMessage[];
	readonly uiReplayMessages?: readonly DroxHostToWebviewMessage[];
}

export async function restoreRunRecoveryForSession(
	sessionService: IDroxSessionService,
	runSettingsService: IDroxRunSettingsService,
	workspaceFsPath: string,
	sessionId: string,
	fallback?: IDroxRunRecoveryRestoreContext,
): Promise<boolean> {
	if (!sessionId.startsWith('ses_')) {
		return false;
	}
	let ctx = await sessionService.readRunRecovery(sessionId, workspaceFsPath);
	if (!ctx && fallback) {
		const messageId = fallback.uiReplayMessages
			? findLastUserMessageIdInUiReplay(fallback.uiReplayMessages)
			: undefined;
		const enginePrompt = buildEnginePromptFromLastUserTranscript(fallback.transcriptMessages);
		if (messageId && enginePrompt) {
			ctx = {
				messageId,
				mode: runSettingsService.getPermissionMode(),
				enginePrompt,
			};
		}
	}
	if (!ctx) {
		return false;
	}
	setPendingRunRecovery(sessionId, ctx);
	return true;
}

export function offerRunRecovery(
	post: (message: DroxHostToWebviewMessage) => void,
	sessionId: string | undefined,
): void {
	const pending = getPendingRunRecovery(sessionId);
	if (!pending) {
		return;
	}
	post({ kind: 'runRecoveryOffer', messageId: pending.messageId });
}

/** @deprecated Use {@link offerRunRecovery}. */
export const offerRunRecoveryAfterError = offerRunRecovery;

type IRunRecoveryDeps = {
	readonly userAskService: IDroxUserAskService;
	readonly clientToolsService: IDroxClientToolsService;
	readonly runSettingsService: IDroxRunSettingsService;
	readonly droxEngineService: IDroxEngineService;
	readonly logService: ILogService;
	readonly runRevertService: IDroxRunRevertService;
	readonly fileService?: IFileService;
	readonly sessionBackgroundService?: IDroxSessionBackgroundService;
};

function cancelActiveRunForRecovery(host: IDroxChatSendRunHost, deps: IRunRecoveryDeps): void {
	if (!host.isRunActive()) {
		return;
	}
	deps.userAskService.resolvePendingAsSkipped();
	deps.userAskService.setActivePermissionMode(undefined);
	const runId = host.getCurrentRunId();
	if (!runId) {
		return;
	}
	host.setSuppressedRunId(runId);
	host.setPendingRunStart(false);
	void cancelDroxAgentRun(
		{ droxEngineService: deps.droxEngineService, logService: deps.logService },
		runId,
		'agent.cancel (recovery)',
	);
	deps.runRevertService.discardActiveRun();
	host.setCurrentRunId(undefined);
	host.syncChatSessionState();
	host.clearPendingTools();
	host.post({ kind: 'clearAssistant' });
	host.post({ kind: 'phase', close: true });
	host.post({ kind: 'state', busy: false });
}

async function startRecoveryRun(
	host: IDroxChatSendRunHost,
	tabs: DroxChatTabsManager,
	deps: IRunRecoveryDeps,
	ctx: IDroxPendingRunRecovery,
	restart: boolean,
): Promise<void> {
	const ws = host.workspaceRoot();
	const sessionId = tabs.currentSessionId;
	if (!ws || !sessionId) {
		return;
	}
	if (deps.userAskService.hasPending) {
		deps.userAskService.resolvePendingAsSkipped();
	}

	if (host.isRunActive()) {
		if (restart) {
			cancelActiveRunForRecovery(host, deps);
		} else {
			host.post({
				kind: 'append',
				role: 'system',
				text: localize(
					'drox.runRecovery.busyResume',
					'Wait for the current run to finish before resuming, or use Restart.',
				),
			});
			offerRunRecovery(host.post.bind(host), sessionId);
			return;
		}
	}

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

		const bridgeDeps: IDroxAgentRunBridgeDeps = {
			clientToolsService: deps.clientToolsService,
			runSettingsService: deps.runSettingsService,
			droxEngineService: deps.droxEngineService,
			logService: deps.logService,
			fileService: deps.fileService,
		};
		const runId = await startDroxAgentRun(bridgeDeps, {
			prompt: ctx.enginePrompt || '.',
			workspace: ws,
			mode: ctx.mode,
			sessionId,
			images: ctx.images && ctx.images.length > 0 ? [...ctx.images] : undefined,
			skipUserTurn: true,
			allowOutsideWorkspace: deps.sessionBackgroundService?.isAllowOutsideWorkspace(sessionId),
		});
		if (runId) {
			host.setPendingRunStart(false);
			host.setCurrentRunId(runId);
			host.syncChatSessionState();
			deps.runRevertService.beginRun(runId, ws, sessionId);
			deps.runRevertService.setRunFirstMessageId(runId, ctx.messageId);
			deps.logService.info(`[Drox] agent.run recovery (${restart ? 'restart' : 'resume'})`, runId);
			offerRunRecovery(host.post.bind(host), sessionId);
		} else {
			host.setPendingRunStart(false);
			host.post({ kind: 'state', busy: false });
			offerRunRecovery(host.post.bind(host), sessionId);
		}
	} catch (e) {
		host.setPendingRunStart(false);
		host.setCurrentRunId(undefined);
		host.syncChatSessionState();
		const text = e instanceof Error ? e.message : String(e);
		deps.logService.error('[Drox] run recovery failed', e);
		host.post({ kind: 'append', role: 'error', text });
		host.post({ kind: 'state', busy: false });
		offerRunRecovery(host.post.bind(host), sessionId);
	}
}

export async function handleDroxResumeRunAfterError(
	host: IDroxChatSendRunHost,
	tabs: DroxChatTabsManager,
	deps: IRunRecoveryDeps & { readonly notificationService: INotificationService },
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
	deps: IRunRecoveryDeps & { readonly notificationService: INotificationService },
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
