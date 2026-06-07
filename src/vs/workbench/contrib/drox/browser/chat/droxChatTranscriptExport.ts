/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { formatDroxTranscriptExport } from '../../common/chat/droxTranscriptExport.js';
import { formatDroxCombinedSessionExport } from '../../common/chat/droxUiReplayExport.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

export async function handleDroxExportTranscript(
	tabs: DroxChatTabsManager,
	sessionService: IDroxSessionService,
	workspaceContextService: IWorkspaceContextService,
	clipboardService: IClipboardService,
	notificationService: INotificationService,
): Promise<void> {
	const sessionId = tabs.currentSessionId;
	if (!sessionId?.startsWith('ses_')) {
		notificationService.warn(localize('drox.export.noSession', 'No session to export — send a message first.'));
		return;
	}
	const ws = workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	if (!ws) {
		notificationService.warn(localize('drox.export.noWorkspace', 'Open a workspace folder to export the transcript.'));
		return;
	}
	try {
		const read = await sessionService.readSession(sessionId, ws);
		const uiReplay = await sessionService.readUiReplay(sessionId, ws);
		const journal = uiReplay.map(m => m as unknown as Record<string, unknown>);
		if (!read.messages.length && journal.length === 0) {
			notificationService.warn(localize('drox.export.empty', 'This session has no messages yet.'));
			return;
		}
		const fromUiJournal = journal.length > 0;
		const text = fromUiJournal
			? formatDroxCombinedSessionExport({
				sessionId,
				workspacePath: ws,
				journal,
				transcriptMessageCount: read.messages.length,
				transcriptMessages: read.messages,
				uiStats: read.uiStats,
			})
			: formatDroxTranscriptExport({
				sessionId,
				workspacePath: ws,
				messages: read.messages,
				uiStats: read.uiStats,
			});
		await clipboardService.writeText(text);
		const stepCount = (text.match(/^Step \d+ —/gm) ?? []).length;
		if (fromUiJournal) {
			notificationService.info(
				localize(
					'drox.export.doneUiJournal',
					'Export copied ({0} steps, {1} UI events, {2} chars) — UI journal + transcript moteur.',
					stepCount,
					journal.length,
					text.length,
				),
			);
		} else {
			notificationService.info(
				localize(
					'drox.export.done',
					'Export copied ({0} steps, {1} transcript messages, {2} chars).',
					stepCount,
					read.messages.length,
					text.length,
				),
			);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		notificationService.error(localize('drox.export.failed', 'Export failed: {0}', msg));
	}
}
