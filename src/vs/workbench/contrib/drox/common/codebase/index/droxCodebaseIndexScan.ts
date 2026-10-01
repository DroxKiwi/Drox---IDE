/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { relativePath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IDroxCodebaseChunk } from '../droxCodebaseChunker.js';
import {
	DROX_CODEBASE_MAX_FILE_BYTES,
	DROX_CODEBASE_MAX_FILES,
	droxCodebaseShouldSkipDirName,
	droxCodebaseShouldSkipFileName,
} from '../droxCodebaseIgnore.js';

export async function droxCodebaseCollectFiles(fileService: IFileService, root: URI): Promise<URI[]> {
	const out: URI[] = [];
	await walk(fileService, root, out);
	return out;
}

async function walk(fileService: IFileService, dir: URI, out: URI[]): Promise<void> {
	if (out.length >= DROX_CODEBASE_MAX_FILES) {
		return;
	}
	let resolved;
	try {
		resolved = await fileService.resolve(dir);
	} catch {
		return;
	}
	for (const child of resolved.children ?? []) {
		if (out.length >= DROX_CODEBASE_MAX_FILES) {
			return;
		}
		if (child.isDirectory) {
			if (droxCodebaseShouldSkipDirName(child.name)) {
				continue;
			}
			await walk(fileService, child.resource, out);
		} else if (!child.isDirectory) {
			if (droxCodebaseShouldSkipFileName(child.name)) {
				continue;
			}
			out.push(child.resource);
		}
	}
}

export function droxCodebaseGroupChunksByPath(chunks: readonly IDroxCodebaseChunk[]): Map<string, IDroxCodebaseChunk[]> {
	const map = new Map<string, IDroxCodebaseChunk[]>();
	for (const c of chunks) {
		const list = map.get(c.path);
		if (list) {
			list.push(c);
		} else {
			map.set(c.path, [c]);
		}
	}
	return map;
}

export function droxCodebaseChunksContentEqual(a: readonly IDroxCodebaseChunk[], b: readonly IDroxCodebaseChunk[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i]!.contentHash !== b[i]!.contentHash || a[i]!.startLine !== b[i]!.startLine || a[i]!.endLine !== b[i]!.endLine) {
			return false;
		}
	}
	return true;
}

export function droxCodebaseJoinWorkspacePath(root: URI, relPosix: string): URI {
	const parts = relPosix.split('/').filter(Boolean);
	return URI.joinPath(root, ...parts);
}

export function droxCodebaseRelativePosix(workspaceRoot: URI, file: URI): string {
	return (relativePath(workspaceRoot, file) ?? file.fsPath).replace(/\\/g, '/');
}

export { DROX_CODEBASE_MAX_FILE_BYTES };
