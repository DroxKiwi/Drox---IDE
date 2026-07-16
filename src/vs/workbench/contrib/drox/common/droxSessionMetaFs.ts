/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../base/common/buffer.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isListableDroxSessionId } from './droxSession.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';

export interface IDroxSessionMeta {
	readonly customTitle?: string;
}

export function droxSessionMetaPath(workspaceFsPath: string, sessionId: string): string {
	return join(droxWorkspaceSessionsDir(workspaceFsPath), `${sessionId}.meta.json`);
}

export async function readDroxSessionMeta(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<IDroxSessionMeta | undefined> {
	if (!isListableDroxSessionId(sessionId)) {
		return undefined;
	}
	const uri = URI.file(droxSessionMetaPath(workspaceFsPath, sessionId));
	try {
		if (!(await fileService.exists(uri))) {
			return undefined;
		}
		const raw = (await fileService.readFile(uri)).value.toString();
		const parsed = JSON.parse(raw) as { customTitle?: unknown; custom_title?: unknown };
		const customTitle = typeof parsed.customTitle === 'string'
			? parsed.customTitle
			: typeof parsed.custom_title === 'string'
				? parsed.custom_title
				: undefined;
		const trimmed = customTitle?.trim();
		return trimmed ? { customTitle: trimmed } : {};
	} catch {
		return undefined;
	}
}

export async function writeDroxSessionMeta(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
	meta: IDroxSessionMeta,
): Promise<void> {
	if (!isListableDroxSessionId(sessionId)) {
		return;
	}
	const uri = URI.file(droxSessionMetaPath(workspaceFsPath, sessionId));
	await fileService.createFolder(URI.file(droxWorkspaceSessionsDir(workspaceFsPath)));
	const payload = JSON.stringify({ customTitle: meta.customTitle ?? null });
	await fileService.writeFile(uri, VSBuffer.fromString(payload));
}
