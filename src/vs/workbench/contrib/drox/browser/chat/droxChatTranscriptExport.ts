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
import { buildDroxAnalysisExport } from '../../common/chat/droxAnalysisExport.js';
import { droxSessionRunCapturePath } from '../../common/droxRunCapture.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

const LATEST_INDEX_FILENAME = 'latest-index.txt';
const LATEST_TRANSCRIPT_FILENAME = 'latest-transcript.txt';


export async function handleDroxExportTranscript(
	tabs: DroxChatTabsManager,
	sessionService: IDroxSessionService,
	workspaceContextService: IWorkspaceContextService,
	clipboardService: IClipboardService,
	notificationService: INotificationService,
	productService: IProductService,
	fileService: IFileService,
	droxEngineService: IDroxEngineService,
): Promise<void> {
	await exportDroxSessionTranscript({
		sessionId: tabs.currentSessionId,
		sessionService,
		workspaceContextService,
		clipboardService,
		notificationService,
		productService,
		fileService,
		droxEngineService,
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
	readonly droxEngineService?: IDroxEngineService;
	/** Pas de toast si le fichier n'a encore aucun message (couper la capture avant un run). */
	readonly quietIfEmpty?: boolean;
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
		let runCaptureRaw: string | undefined;
		try {
			const captureFile = await fileService.readFile(URI.file(droxSessionRunCapturePath(ws, sessionId)));
			runCaptureRaw = captureFile.value.toString();
		} catch {
			runCaptureRaw = undefined;
		}
		const journal = uiReplay.map(m => m as unknown as Record<string, unknown>);
		if (!read.messages.length && journal.length === 0 && !runCaptureRaw?.trim()) {
			if (!opts.quietIfEmpty) {
				notificationService.warn(localize('drox.export.empty', 'This session has no messages yet.'));
			}
			return;
		}
		const exportedAt = new Date();
		const analysis = buildDroxAnalysisExport({
			sessionId,
			runCaptureRaw,
			messages: read.messages,
		});
		const exportDir = join(ws, '.drox', 'exports');
		const blobDir = join(exportDir, 'blobs');
		await fileService.createFolder(URI.file(blobDir));
		for (const blob of analysis.blobs) {
			await fileService.writeFile(URI.file(join(blobDir, `${blob.hash}.txt`)), VSBuffer.fromString(blob.text));
		}
		const stamp = exportedAt.toISOString().replace(/[:.]/g, '-');
		const indexLatest = join(exportDir, LATEST_INDEX_FILENAME);
		const transcriptLatest = join(exportDir, LATEST_TRANSCRIPT_FILENAME);
		const indexStamped = join(exportDir, `index-${sessionId}-${stamp}.txt`);
		const transcriptStamped = join(exportDir, `transcript-${sessionId}-${stamp}.txt`);
		await fileService.writeFile(URI.file(indexLatest), VSBuffer.fromString(analysis.index));
		await fileService.writeFile(URI.file(indexStamped), VSBuffer.fromString(analysis.index));
		await fileService.writeFile(URI.file(transcriptLatest), VSBuffer.fromString(analysis.transcript));
		await fileService.writeFile(URI.file(transcriptStamped), VSBuffer.fromString(analysis.transcript));
		await clipboardService.writeText(analysis.index);
		notificationService.info(
			localize(
				'drox.export.doneAnalysis',
				'Export saved. Index: {0}. Transcript: {1}. Blobs: {2}.',
				indexLatest,
				transcriptLatest,
				analysis.blobs.length,
			),
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		notificationService.error(localize('drox.export.failed', 'Export failed: {0}', msg));
	}
}
