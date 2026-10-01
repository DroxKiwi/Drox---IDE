/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDroxCodebaseChunk } from './droxCodebaseChunker.js';
import { IDroxCodebaseVectorRow } from './droxCodebaseHybrid.js';
import {
	droxCodebaseChunksJsonPath,
	droxCodebaseIndexDir,
	droxCodebaseManifestPath,
	droxCodebaseVectorsJsonPath,
} from './droxCodebasePaths.js';

export const DROX_CODEBASE_STORE_SCHEMA = 1;

export interface IDroxCodebaseManifest {
	readonly schema: number;
	readonly mode: 'lexical' | 'hybrid';
	readonly rootFsPath: string;
	readonly updatedAt: number;
	readonly files: number;
	readonly chunks: number;
	readonly vectors: number;
	readonly bytes: number;
	readonly embedDimensions?: number;
	readonly embedModelPath?: string;
}

export interface IDroxCodebaseStorePayload {
	readonly schema: number;
	readonly chunks: readonly IDroxCodebaseChunk[];
}

export interface IDroxCodebaseVectorsPayload {
	readonly schema: number;
	readonly dimensions: number;
	readonly modelPath?: string;
	readonly vectors: readonly IDroxCodebaseVectorRow[];
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

export async function droxCodebaseReadVectors(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<readonly IDroxCodebaseVectorRow[]> {
	const uri = URI.file(droxCodebaseVectorsJsonPath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return [];
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		const parsed = JSON.parse(raw) as IDroxCodebaseVectorsPayload;
		return parsed.vectors ?? [];
	} catch {
		return [];
	}
}

export async function droxCodebaseWriteStore(
	fileService: IFileService,
	workspaceRootFsPath: string,
	chunks: readonly IDroxCodebaseChunk[],
	opts?: {
		readonly vectors?: readonly IDroxCodebaseVectorRow[];
		readonly embedDimensions?: number;
		readonly embedModelPath?: string;
	},
): Promise<IDroxCodebaseManifest> {
	const indexDir = URI.file(droxCodebaseIndexDir(workspaceRootFsPath));
	await fileService.createFolder(indexDir);

	const vectors = opts?.vectors ?? [];
	const bytes = chunks.reduce((n, c) => n + c.text.length, 0)
		+ vectors.reduce((n, v) => n + v.values.length * 4, 0);
	const files = new Set(chunks.map(c => c.path)).size;
	const hasVectors = vectors.length > 0;
	const manifest: IDroxCodebaseManifest = {
		schema: DROX_CODEBASE_STORE_SCHEMA,
		mode: hasVectors ? 'hybrid' : 'lexical',
		rootFsPath: workspaceRootFsPath,
		updatedAt: Date.now(),
		files,
		chunks: chunks.length,
		vectors: vectors.length,
		bytes,
		embedDimensions: opts?.embedDimensions,
		embedModelPath: opts?.embedModelPath,
	};

	const payload: IDroxCodebaseStorePayload = {
		schema: DROX_CODEBASE_STORE_SCHEMA,
		chunks,
	};

	await fileService.writeFile(
		URI.file(droxCodebaseChunksJsonPath(workspaceRootFsPath)),
		VSBuffer.fromString(JSON.stringify(payload)),
	);

	if (hasVectors) {
		const vectorsPayload: IDroxCodebaseVectorsPayload = {
			schema: DROX_CODEBASE_STORE_SCHEMA,
			dimensions: opts?.embedDimensions ?? vectors[0]!.values.length,
			modelPath: opts?.embedModelPath,
			vectors,
		};
		await fileService.writeFile(
			URI.file(droxCodebaseVectorsJsonPath(workspaceRootFsPath)),
			VSBuffer.fromString(JSON.stringify(vectorsPayload)),
		);
	} else {
		const vectorsUri = URI.file(droxCodebaseVectorsJsonPath(workspaceRootFsPath));
		if (await fileService.exists(vectorsUri)) {
			await fileService.del(vectorsUri, { useTrash: false });
		}
	}

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
