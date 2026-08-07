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
import { extractDroxUserRunsFromJournal, formatDroxTranscriptExport } from '../../common/chat/droxTranscriptExport.js';
import { formatDroxCombinedSessionExport } from '../../common/chat/droxUiReplayExport.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

/** Presse-papiers : texte intégral jusqu'à ce seuil ; au-delà, pointeur fichier uniquement (pas d'aperçu tronqué). */
const CLIPBOARD_MAX_FULL_CHARS = 2_000_000;
const LATEST_EXPORT_FILENAME = 'latest-transcript.txt';

function formatExportClipboardPointer(opts: {
	readonly sessionId: string;
	readonly filePath: string;
	readonly latestPath: string;
	readonly charCount: number;
	readonly stepCount: number;
	readonly userRunCount: number;
}): string {
	return [
		'Drox transcript export — clipboard pointer only (export too large for the clipboard).',
		`Session: ${opts.sessionId}`,
		`Size: ${opts.charCount} characters · ${opts.stepCount} steps · ${opts.userRunCount} user run(s)`,
		'',
		`Timestamped file: ${opts.filePath}`,
		`Stable copy: ${opts.latestPath}`,
		'',
		'Open the file on disk for full PART A + B + C + D + E (all user cycles).',
	].join('\n');
}

export async function handleDroxExportTranscript(
	tabs: DroxChatTabsManager,
	sessionService: IDroxSessionService,
	workspaceContextService: IWorkspaceContextService,
	clipboardService: IClipboardService,
	notificationService: INotificationService,
	productService: IProductService,
	fileService: IFileService,
): Promise<void> {
	await exportDroxSessionTranscript({
		sessionId: tabs.currentSessionId,
		sessionService,
		workspaceContextService,
		clipboardService,
		notificationService,
		productService,
		fileService,
	});
}

/** Export + clipboard for any `ses_*` (webview tabs or native IDE chat). Dev surface only. */
export async function exportDroxSessionTranscript(opts: {
	readonly sessionId: string | undefined;
	readonly sessionService: IDroxSessionService;
	readonly workspaceContextService: IWorkspaceContextService;
	readonly clipboardService: IClipboardService;
	readonly notificationService: INotificationService;
	readonly productService: IProductService;
	readonly fileService: IFileService;
}): Promise<void> {
	const {
		sessionService,
		workspaceContextService,
		clipboardService,
		notificationService,
		productService,
		fileService,
	} = opts;

	if (!isDroxDevFeatureEnabled('exportTranscript', productService)) {
		notificationService.warn(
			localize('drox.export.devOnly', 'Export transcript is only available in the dev surface.'),
		);
		return;
	}

	const sessionId = opts.sessionId;
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
				engineTrace: read.engineTrace,
				uiStats: read.uiStats,
				exportedAt,
			})
			: formatDroxTranscriptExport({
				sessionId,
				workspacePath: ws,
				messages: read.messages,
				uiStats: read.uiStats,
				exportedAt,
				includeEngineContext: true,
			});

		const exportDir = join(ws, '.drox', 'exports');
		await fileService.createFolder(URI.file(exportDir));
		const stamp = exportedAt.toISOString().replace(/[:.]/g, '-');
		const filePath = join(exportDir, `transcript-${sessionId}-${stamp}.txt`);
		const latestPath = join(exportDir, LATEST_EXPORT_FILENAME);
		const fileBuffer = VSBuffer.fromString(text);
		await fileService.writeFile(URI.file(filePath), fileBuffer);
		await fileService.writeFile(URI.file(latestPath), fileBuffer);

		const stepCount = (text.match(/^Step \d+ —/gm) ?? []).length;
		const userRunCount = fromUiJournal
			? extractDroxUserRunsFromJournal(journal).length
			: (read.messages.filter(m => m.role === 'user').length || 1);
		const clipboardText =
			text.length <= CLIPBOARD_MAX_FULL_CHARS
				? text
				: formatExportClipboardPointer({
					sessionId,
					filePath,
					latestPath,
					charCount: text.length,
					stepCount,
					userRunCount,
				});
		await clipboardService.writeText(clipboardText);

		const clipboardNote =
			text.length <= CLIPBOARD_MAX_FULL_CHARS
				? localize('drox.export.clipboardFull', 'presse-papiers = export complet')
				: localize('drox.export.clipboardPointer', 'presse-papiers = pointeur fichier (export {0} chars)', text.length);

		if (fromUiJournal) {
			notificationService.info(
				localize(
					'drox.export.doneUiJournal',
					'Export saved to {0} and {1} ({2} steps, {3} UI events, {4} engine trace records, {5} user runs, {6} chars) — {7}.',
					filePath,
					latestPath,
					stepCount,
					journal.length,
					read.engineTrace?.length ?? 0,
					userRunCount,
					text.length,
					clipboardNote,
				),
			);
		} else {
			notificationService.info(
				localize(
					'drox.export.done',
					'Export saved to {0} and {1} ({2} steps, {3} transcript messages, {4} chars) — {5}.',
					filePath,
					latestPath,
					stepCount,
					read.messages.length,
					text.length,
					clipboardNote,
				),
			);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		notificationService.error(localize('drox.export.failed', 'Export failed: {0}', msg));
	}
}
