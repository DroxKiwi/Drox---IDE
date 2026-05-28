/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDroxAgentRunImage, IDroxAttachmentPayload, prepareImageAttachmentsForRun } from '../../common/droxAttachments.js';
import { isVisionRelatedLlmError, formatVisionChatError } from '../../common/droxVision.js';
import { IDroxAttachmentsService } from '../../common/droxAttachmentsService.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { formatPastesForPrompt, IDroxPasteAttachmentPayload, IDroxUserMessagePasteWire, toUserMessagePasteWire } from '../../common/droxPasteCandidates.js';
import { formatReferencesPromptBlock, IDroxReferencePayload, IDroxUserMessageReferenceWire, resolveDroxReferences, toUserMessageReferenceWire } from '../../common/droxReferences.js';
import { buildUserPromptStickyPayload } from '../../common/droxUserPromptSticky.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { normalizeDroxPermissionMode } from '../../common/droxPermissionAsk.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

export interface IDroxChatSendRunHost {
	post(message: DroxHostToWebviewMessage): void;
	workspaceRoot(): string | undefined;
	getCurrentRunId(): string | undefined;
	setCurrentRunId(runId: string | undefined): void;
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
	const ws = host.workspaceRoot();
	if (!ws) {
		const msg = localize('drox.noWorkspace', 'Open a workspace folder before using Drox.');
		deps.notificationService.error(msg);
		host.post({ kind: 'append', role: 'error', text: msg });
		return;
	}
	const runMode = normalizeDroxPermissionMode(mode);
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
				const msg = localize('drox.attachmentsEmpty', 'Aucune image valide à envoyer.');
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
			const msg = localize('drox.attachmentsFailed', 'Échec de préparation des images : {0}', text);
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
	tabs.setTabTitleFromUserPrompt(tabs.currentSessionId, displayed || trimmed);
	tabs.ensureSessionForSend();
	try {
		const allTools = deps.clientToolsService.executableToolNames;
		const executableTools = deps.runSettingsService.filterExecutableTools(allTools);
		await deps.droxEngineService.initialize({
			executableTools: [...executableTools],
			interactiveAsk: true,
		});
		const runParams = deps.runSettingsService.buildAgentRunParams({
			prompt: finalPrompt,
			workspace: ws,
			mode: runMode,
			sessionId: tabs.currentSessionId!,
			images: imagesPayload.length > 0 ? imagesPayload : undefined,
		});
		const result = await deps.droxEngineService.request('agent.run', runParams) as { runId?: string };
		if (typeof result?.runId === 'string') {
			host.setCurrentRunId(result.runId);
			host.syncChatSessionState();
			deps.runRevertService.beginRun(result.runId, ws, tabs.currentSessionId);
			deps.runRevertService.setRunFirstMessageId(result.runId, messageId);
			deps.logService.info('[Drox] agent.run', result.runId);
		}
	} catch (e) {
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
): void {
	deps.userAskService.resolvePendingAsSkipped();
	deps.userAskService.setActivePermissionMode(undefined);
	const runId = host.getCurrentRunId();
	if (!runId) {
		host.post({ kind: 'state', busy: false });
		return;
	}
	host.setSuppressedRunId(runId);
	void deps.droxEngineService.request('agent.cancel', { runId }).catch(e => {
		deps.logService.warn('[Drox] agent.cancel', e);
	});
	deps.runRevertService.discardActiveRun();
	host.setCurrentRunId(undefined);
	host.syncChatSessionState();
	host.clearPendingTools();
	host.post({ kind: 'clearAssistant' });
	host.post({ kind: 'phase', close: true });
	host.post({ kind: 'append', role: 'system', text: localize('drox.run.cancelled', 'Drox: run stopped.') });
	host.post({ kind: 'state', busy: false });
}
