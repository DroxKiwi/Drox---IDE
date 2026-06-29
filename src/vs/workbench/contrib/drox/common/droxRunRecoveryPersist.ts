/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { join } from '../../../../base/common/path.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import type { IDroxAgentRunImage } from './droxAttachments.js';
import { DroxHostToWebviewMessage } from '../browser/droxChatBridge.js';
import { IDroxTranscriptMessage } from './droxSession.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';

export interface IDroxPersistedRunRecovery {
	readonly messageId: string;
	readonly mode: string;
	readonly enginePrompt: string;
	readonly images?: readonly IDroxAgentRunImage[];
}

export function droxSessionRunRecoveryPath(workspaceFsPath: string, sessionId: string): string {
	return join(droxWorkspaceSessionsDir(workspaceFsPath), `${sessionId}.run-recovery.json`);
}

function parsePersistedRunRecovery(raw: unknown): IDroxPersistedRunRecovery | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const row = raw as Record<string, unknown>;
	const messageId = typeof row.messageId === 'string' ? row.messageId.trim() : '';
	const mode = typeof row.mode === 'string' ? row.mode.trim() : '';
	const enginePrompt = typeof row.enginePrompt === 'string' ? row.enginePrompt : '';
	if (!messageId || !mode || !enginePrompt.trim()) {
		return undefined;
	}
	let images: IDroxAgentRunImage[] | undefined;
	if (Array.isArray(row.images)) {
		const parsed: IDroxAgentRunImage[] = [];
		for (const item of row.images) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			const img = item as Record<string, unknown>;
			const mime = typeof img.mime === 'string' ? img.mime : typeof img.mimeType === 'string' ? img.mimeType : '';
			const data = typeof img.data === 'string' ? img.data : '';
			if (mime && data) {
				parsed.push({ mime, data });
			}
		}
		if (parsed.length > 0) {
			images = parsed;
		}
	}
	return { messageId, mode, enginePrompt, images };
}

export async function readPersistedRunRecovery(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<IDroxPersistedRunRecovery | undefined> {
	if (!sessionId.startsWith('ses_')) {
		return undefined;
	}
	const path = droxSessionRunRecoveryPath(workspaceFsPath, sessionId);
	const uri = URI.file(path);
	if (!(await fileService.exists(uri))) {
		return undefined;
	}
	try {
		const content = await fileService.readFile(uri);
		const parsed = JSON.parse(content.value.toString()) as unknown;
		return parsePersistedRunRecovery(parsed);
	} catch {
		return undefined;
	}
}

export async function writePersistedRunRecovery(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
	ctx: IDroxPersistedRunRecovery,
): Promise<void> {
	if (!sessionId.startsWith('ses_')) {
		return;
	}
	const path = droxSessionRunRecoveryPath(workspaceFsPath, sessionId);
	const uri = URI.file(path);
	const payload = JSON.stringify({
		messageId: ctx.messageId,
		mode: ctx.mode,
		enginePrompt: ctx.enginePrompt,
		images: ctx.images,
	});
	await fileService.writeFile(uri, VSBuffer.fromString(payload));
}

export async function clearPersistedRunRecovery(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<void> {
	if (!sessionId.startsWith('ses_')) {
		return;
	}
	const uri = URI.file(droxSessionRunRecoveryPath(workspaceFsPath, sessionId));
	if (await fileService.exists(uri)) {
		await fileService.del(uri);
	}
}

export function findLastUserMessageIdInUiReplay(
	messages: readonly DroxHostToWebviewMessage[],
): string | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.kind === 'append' && m.role === 'user' && typeof m.messageId === 'string' && m.messageId.trim()) {
			return m.messageId.trim();
		}
	}
	return undefined;
}

export function buildEnginePromptFromLastUserTranscript(
	messages: readonly IDroxTranscriptMessage[],
): string | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role !== 'user') {
			continue;
		}
		const parts: string[] = [];
		for (const c of m.content) {
			if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
				parts.push(c.text.trim());
			}
		}
		const joined = parts.join('\n').trim();
		if (joined) {
			return joined;
		}
	}
	return undefined;
}
