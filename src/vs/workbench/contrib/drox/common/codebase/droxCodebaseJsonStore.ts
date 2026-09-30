/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDroxCodebaseChunk } from './droxCodebaseChunker.js';
import { droxCodebaseChunksJsonPath, droxCodebaseIndexDir, droxCodebaseManifestPath } from './droxCodebasePaths.js';

export const DROX_CODEBASE_STORE_SCHEMA = 1;

export interface IDroxCodebaseManifest {
	readonly schema: number;
	readonly mode: 'lexical';
	readonly rootFsPath: string;
	readonly updatedAt: number;
	readonly files: number;
	readonly chunks: number;
	readonly vectors: number;
	readonly bytes: number;
}

export interface IDroxCodebaseStorePayload {
	readonly schema: number;
	readonly chunks: readonly IDroxCodebaseChunk[];
}

export async function droxCodebaseReadManifest(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<IDroxCodebaseManifest | undefined> {
	const uri = URI.file(droxCodebaseManifestPath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return undefined;
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		return JSON.parse(raw) as IDroxCodebaseManifest;
	} catch {
		return undefined;
	}
}

export async function droxCodebaseReadChunks(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<readonly IDroxCodebaseChunk[]> {
	const uri = URI.file(droxCodebaseChunksJsonPath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return [];
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		const parsed = JSON.parse(raw) as IDroxCodebaseStorePayload;
		return parsed.chunks ?? [];
	} catch {
		return [];
	}
}

export async function droxCodebaseWriteStore(
	fileService: IFileService,
	workspaceRootFsPath: string,
	chunks: readonly IDroxCodebaseChunk[],
): Promise<IDroxCodebaseManifest> {
	const indexDir = URI.file(droxCodebaseIndexDir(workspaceRootFsPath));
	await fileService.createFolder(indexDir);

	const bytes = chunks.reduce((n, c) => n + c.text.length, 0);
	const files = new Set(chunks.map(c => c.path)).size;
	const manifest: IDroxCodebaseManifest = {
		schema: DROX_CODEBASE_STORE_SCHEMA,
		mode: 'lexical',
		rootFsPath: workspaceRootFsPath,
		updatedAt: Date.now(),
		files,
		chunks: chunks.length,
		vectors: 0,
		bytes,
	};

	const payload: IDroxCodebaseStorePayload = {
		schema: DROX_CODEBASE_STORE_SCHEMA,
		chunks,
	};

	await fileService.writeFile(
		URI.file(droxCodebaseChunksJsonPath(workspaceRootFsPath)),
		VSBuffer.fromString(JSON.stringify(payload)),
	);
	await fileService.writeFile(
		URI.file(droxCodebaseManifestPath(workspaceRootFsPath)),
		VSBuffer.fromString(JSON.stringify(manifest, null, 2)),
	);

	return manifest;
}

export async function droxCodebaseDeleteStore(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<void> {
	const indexDir = URI.file(droxCodebaseIndexDir(workspaceRootFsPath));
	if (await fileService.exists(indexDir)) {
		await fileService.del(indexDir, { recursive: true, useTrash: false });
	}
}
