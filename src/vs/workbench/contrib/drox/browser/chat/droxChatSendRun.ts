/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDroxAgentRunImage, IDroxAttachmentPayload, prepareImageAttachmentsForRun } from '../../common/droxAttachments.js';
import { isVisionRelatedLlmError, formatVisionChatError } from '../../common/droxVision.js';
import { IDroxAttachmentsService } from '../../common/droxAttachmentsService.js';
import { cancelDroxAgentRun, IDroxAgentRunBridgeDeps, startDroxAgentRun } from '../../common/droxAgentRunBridge.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxCodebaseContextService } from '../../common/codebase/droxCodebaseContextService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxRegulationService } from '../../common/regulation/droxRegulationServiceContract.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { formatPastesForPrompt, IDroxPasteAttachmentPayload, IDroxUserMessagePasteWire, toUserMessagePasteWire } from '../../common/droxPasteCandidates.js';
import { formatReferencesPromptBlock, IDroxReferencePayload, IDroxUserMessageReferenceWire, resolveDroxReferences, toUserMessageReferenceWire } from '../../common/droxReferences.js';
import { buildUserPromptStickyPayload } from '../../common/droxUserPromptSticky.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { IDroxSessionBackgroundService } from '../../../../../sessions/contrib/drox/common/droxSessionBackgroundService.js';
import {
	offerRunRecovery,
	persistPendingRunRecovery,
	setPendingRunRecovery,
} from './droxChatRunRecovery.js';
import {
	getProfessorModeRemovedNotificationMessage,
	resolveDroxPermissionMode,
} from '../../common/droxPermissionAsk.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { resolveDroxCodebaseForcePathPrefixesFromEditor } from '../codebase/droxCodebaseForceEditorPath.js';

export interface IDroxChatSendRunHost {
	post(message: DroxHostToWebviewMessage): void;
	workspaceRoot(): string | undefined;
	getCurrentRunId(): string | undefined;
	setCurrentRunId(runId: string | undefined): void;
	isRunActive(): boolean;
	setPendingRunStart(pending: boolean): void;
	syncChatSessionState(): void;
	getSuppressedRunId(): string | undefined;
	setSuppressedRunId(runId: string | undefined): void;
	resolveUserAskSkipped(): void;
	clearPendingTools(): void;
}

export async function executeDroxChatSend(
	host: IDroxChatSendRunHost,
	tabs: DroxChatTabsManager,
	deps: {
		readonly userAskService: IDroxUserAskService;
		readonly notificationService: INotificationService;
		readonly attachmentsService: IDroxAttachmentsService;
		readonly fileService: IFileService;
		readonly clientToolsService: IDroxClientToolsService;
		readonly runSettingsService: IDroxRunSettingsService;
		readonly droxEngineService: IDroxEngineService;
		readonly logService: ILogService;
		readonly runRevertService: IDroxRunRevertService;
		readonly sessionService: IDroxSessionService;
		readonly sessionBackgroundService?: IDroxSessionBackgroundService;
		readonly codebaseContextService?: IDroxCodebaseContextService;
		readonly editorService?: IEditorService;
		readonly regulationService?: Pick<IDroxRegulationService, 'getModule'>;
	},
	prompt: string,
	mode: string,
	attachments: IDroxAttachmentPayload[] = [],
	references: readonly IDroxReferencePayload[] = [],
	pastes: readonly IDroxPasteAttachmentPayload[] = [],
): Promise<void> {
	const trimmed = prompt.trim();
	const hasAttachments = attachments.length > 0;
	const hasReferences = references.length > 0;
	const hasPastes = pastes.length > 0;
	if (!trimmed && !hasAttachments && !hasReferences && !hasPastes) {
		return;
	}
	if (deps.userAskService.hasPending) {
		return;
	}
	if (host.isRunActive()) {
		deps.logService.warn('[Drox] send ignored — run already active');
		host.post({
			kind: 'append',
			role: 'system',
			text: localize('drox.send.runActive', 'A run is already in progress. Stop it or wait until it finishes.'),
		});
		return;
	}
	const ws = host.workspaceRoot();
	if (!ws) {
		const msg = localize('drox.noWorkspace', 'Open a workspace folder before using Drox.');
		deps.notificationService.error(msg);
		host.post({ kind: 'append', role: 'error', text: msg });
		return;
	}
	const resolved = resolveDroxPermissionMode(mode);
	if (resolved.downgradedFromProfessor) {
		deps.notificationService.warn(getProfessorModeRemovedNotificationMessage());
	}
	const runMode = resolved.mode;
	deps.userAskService.setActivePermissionMode(runMode);
	let finalPrompt = trimmed;
	let displayed = trimmed;
	let imagesPayload: IDroxAgentRunImage[] = [];
	let userMessageImages: { relPath: string; dataUrl: string }[] = [];
	if (hasAttachments) {
		try {
			const prepared = await prepareImageAttachmentsForRun({
				trimmed,
				workspaceRoot: ws,
				attachments,
				persist: atts => deps.attachmentsService.persistAttachments(ws, atts),
			});
			if (!prepared) {
				const msg = localize('drox.attachmentsEmpty', 'No valid images to send.');
				host.post({ kind: 'append', role: 'error', text: msg });
				return;
			}
			imagesPayload = [...prepared.images];
			finalPrompt = prepared.finalPrompt;
			displayed = prepared.displayed;
			userMessageImages = [...prepared.userMessageImages];
			deps.logService.info(`[Drox] Sending ${imagesPayload.length} image(s) to engine`);
		} catch (e) {
			const text = e instanceof Error ? e.message : String(e);
			const msg = localize('drox.attachmentsFailed', 'Failed to prepare images: {0}', text);
			deps.notificationService.error(msg);
			host.post({ kind: 'append', role: 'error', text: msg });
			return;
		}
	}
	let userMessageRefs: IDroxUserMessageReferenceWire[] = [];
	if (hasReferences) {
		const resolved = await resolveDroxReferences(deps.fileService, ws, references);
		if (resolved.length > 0) {
			const block = formatReferencesPromptBlock(ws, resolved);
			finalPrompt = finalPrompt ? `${finalPrompt}\n\n${block}` : block;
			userMessageRefs = resolved.map(toUserMessageReferenceWire);
		}
	}
	let userMessagePastes: IDroxUserMessagePasteWire[] = [];
	if (hasPastes) {
		const { promptBlock } = formatPastesForPrompt(pastes, ws);
		if (promptBlock) {
			finalPrompt = finalPrompt ? `${finalPrompt}\n\n${promptBlock}` : promptBlock;
		}
		userMessagePastes = pastes
			.map(toUserMessagePasteWire)
			.filter((p): p is IDroxUserMessagePasteWire => p !== undefined);
	}
	const messageId = `msg_${generateUuid()}`;
	host.post({
		kind: 'userPromptSticky',
		...buildUserPromptStickyPayload(displayed, trimmed, attachments.length),
	});
	host.setPendingRunStart(true);
	host.post({ kind: 'state', busy: true });
	host.post({ kind: 'clearAssistant' });
	host.post({
		kind: 'append',
		role: 'user',
		text: displayed,
		messageId,
		references: userMessageRefs.length > 0 ? userMessageRefs : undefined,
		pastes: userMessagePastes.length > 0 ? userMessagePastes : undefined,
		images: userMessageImages.length > 0 ? userMessageImages : undefined,
	});
	const sessionId = tabs.currentSessionId!;
	setPendingRunRecovery(sessionId, {
		messageId,
		mode: runMode,
		enginePrompt: finalPrompt,
		images: imagesPayload.length > 0 ? imagesPayload : undefined,
	});
	void persistPendingRunRecovery(deps.sessionService, ws, sessionId);
	offerRunRecovery(host.post.bind(host), sessionId);
	tabs.setTabTitleFromUserPrompt(tabs.currentSessionId, displayed || trimmed);
	tabs.ensureSessionForSend();
	try {
		const bridgeDeps: IDroxAgentRunBridgeDeps = {
			clientToolsService: deps.clientToolsService,
			runSettingsService: deps.runSettingsService,
			droxEngineService: deps.droxEngineService,
			logService: deps.logService,
			fileService: deps.fileService,
			codebaseContextService: deps.codebaseContextService,
			regulationService: deps.regulationService,
			resolveCodebaseForcePathPrefixes: deps.editorService
				? wsPath => resolveDroxCodebaseForcePathPrefixesFromEditor(deps.editorService!, wsPath)
				: undefined,
		};
		const runId = await startDroxAgentRun(bridgeDeps, {
			prompt: finalPrompt,
			workspace: ws,
			mode: runMode,
			sessionId: tabs.currentSessionId!,
			images: imagesPayload.length > 0 ? imagesPayload : undefined,
			allowOutsideWorkspace: deps.sessionBackgroundService?.isAllowOutsideWorkspace(tabs.currentSessionId!),
		});
		if (runId) {
			host.setPendingRunStart(false);
			host.setCurrentRunId(runId);
			host.syncChatSessionState();
			deps.runRevertService.beginRun(runId, ws, tabs.currentSessionId);
			deps.runRevertService.setRunFirstMessageId(runId, messageId);
		} else {
			host.setPendingRunStart(false);
			host.post({ kind: 'state', busy: false });
			offerRunRecovery(host.post.bind(host), tabs.currentSessionId);
		}
	} catch (e) {
		host.setPendingRunStart(false);
		host.setCurrentRunId(undefined);
		host.syncChatSessionState();
		const text = e instanceof Error ? e.message : String(e);
		deps.logService.error('[Drox] agent.run failed', e);
		const model = deps.runSettingsService.getLlmSettings().model;
		const errText = imagesPayload.length > 0 && isVisionRelatedLlmError(text)
			? formatVisionChatError(model, text)
			: text;
		host.post({ kind: 'append', role: 'error', text: errText });
		host.post({ kind: 'state', busy: false });
		offerRunRecovery(host.post.bind(host), tabs.currentSessionId);
	}
}

export function cancelDroxChatRun(
	host: IDroxChatSendRunHost,
	deps: {
		readonly userAskService: IDroxUserAskService;
		readonly droxEngineService: IDroxEngineService;
		readonly logService: ILogService;
		readonly runRevertService: IDroxRunRevertService;
	},
	sessionId: string | undefined,
): void {
	deps.userAskService.resolvePendingAsSkipped();
	deps.userAskService.setActivePermissionMode(undefined);
	const runId = host.getCurrentRunId();
	if (!runId) {
		host.post({ kind: 'state', busy: false });
		return;
	}
	host.setSuppressedRunId(runId);
	host.setPendingRunStart(false);
	void cancelDroxAgentRun(
		{ droxEngineService: deps.droxEngineService, logService: deps.logService },
		runId,
	);
	deps.runRevertService.discardActiveRun();
	host.setCurrentRunId(undefined);
	host.syncChatSessionState();
	host.clearPendingTools();
	host.post({ kind: 'clearAssistant' });
	host.post({ kind: 'phase', close: true });
	host.post({ kind: 'append', role: 'system', text: localize('drox.run.cancelled', 'Drox: run stopped.') });
	host.post({ kind: 'state', busy: false });
	offerRunRecovery(host.post.bind(host), sessionId);
}
