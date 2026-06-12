/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { formatDroxTranscriptExport } from '../../common/chat/droxTranscriptExport.js';
import { formatDroxCombinedSessionExport } from '../../common/chat/droxUiReplayExport.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

/** Au-delà de ce seuil, le presse-papiers reçoit un aperçu + le fichier complet sur disque. */
const CLIPBOARD_PREVIEW_CHARS = 120_000;

export async function handleDroxExportTranscript(
	tabs: DroxChatTabsManager,
	sessionService: IDroxSessionService,
	workspaceContextService: IWorkspaceContextService,
	clipboardService: IClipboardService,
	notificationService: INotificationService,
	productService: IProductService,
	fileService: IFileService,
): Promise<void> {
	if (!isDroxDevFeatureEnabled('exportTranscript', productService)) {
		notificationService.warn(
			localize('drox.export.devOnly', 'Export transcript is only available in the dev surface.'),
		);
		return;
	}

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
		const exportedAt = new Date();
		const fromUiJournal = journal.length > 0;
		const text = fromUiJournal
			? formatDroxCombinedSessionExport({
				sessionId,
				workspacePath: ws,
				journal,
				transcriptMessageCount: read.messages.length,
				transcriptMessages: read.messages,
				uiStats: read.uiStats,
				exportedAt,
			})
			: formatDroxTranscriptExport({
				sessionId,
				workspacePath: ws,
				messages: read.messages,
				uiStats: read.uiStats,
				exportedAt,
			});

		const exportDir = join(ws, '.drox', 'exports');
		await fileService.createFolder(URI.file(exportDir));
		const stamp = exportedAt.toISOString().replace(/[:.]/g, '-');
		const filePath = join(exportDir, `transcript-${sessionId}-${stamp}.txt`);
		await fileService.writeFile(URI.file(filePath), VSBuffer.fromString(text));

		const clipboardText =
			text.length <= CLIPBOARD_PREVIEW_CHARS
				? text
				: `${text.slice(0, CLIPBOARD_PREVIEW_CHARS)}\n\n… [clipboard preview truncated — full export: ${filePath} (${text.length} chars)]`;
		await clipboardService.writeText(clipboardText);

		const stepCount = (text.match(/^Step \d+ —/gm) ?? []).length;
		if (fromUiJournal) {
			notificationService.info(
				localize(
					'drox.export.doneUiJournal',
					'Export saved to {0} ({1} steps, {2} UI events, {3} chars) — UI journal + moteur + JSONL brut.',
					filePath,
					stepCount,
					journal.length,
					text.length,
				),
			);
		} else {
			notificationService.info(
				localize(
					'drox.export.done',
					'Export saved to {0} ({1} steps, {2} transcript messages, {3} chars).',
					filePath,
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
