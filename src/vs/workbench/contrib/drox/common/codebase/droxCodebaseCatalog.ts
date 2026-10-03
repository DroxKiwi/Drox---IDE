/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseChunk } from './droxCodebaseChunker.js';
import { IDroxCodebaseVectorRow } from './droxCodebaseHybrid.js';

export interface IDroxCodebaseCatalogChunk {
	readonly id: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly preview: string;
	readonly textBytes: number;
	readonly hasVector: boolean;
}

export interface IDroxCodebaseCatalogFile {
	readonly path: string;
	readonly chunkCount: number;
	readonly vectorCount: number;
	readonly textBytes: number;
	readonly chunks: readonly IDroxCodebaseCatalogChunk[];
}

export interface IDroxCodebaseCatalog {
	readonly files: readonly IDroxCodebaseCatalogFile[];
	readonly totalFiles: number;
	readonly totalChunks: number;
	readonly totalVectors: number;
	readonly textBytes: number;
}

export interface IDroxCodebaseCompactResult {
	readonly bytesBefore: number;
	readonly bytesAfter: number;
	readonly files: number;
	readonly chunks: number;
	readonly vectors: number;
	readonly orphanVectorsRemoved: number;
}

function normalizeCatalogPath(path: string): string {
	return path.replace(/\\/g, '/');
}

function previewText(text: string, max = 120): string {
	const oneLine = text.replace(/\s+/g, ' ').trim();
	return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}...`;
}

/**
 * Build a browseable file → chunk catalogue from store payloads (CB3b).
 */
export function buildDroxCodebaseCatalog(
	chunks: readonly IDroxCodebaseChunk[],
	vectors: readonly IDroxCodebaseVectorRow[] = [],
): IDroxCodebaseCatalog {
	const vectorIds = new Set(vectors.map(v => v.chunkId));
	const byPath = new Map<string, IDroxCodebaseChunk[]>();
	for (const c of chunks) {
		const key = normalizeCatalogPath(c.path);
		const list = byPath.get(key);
		if (list) {
			list.push(c);
		} else {
			byPath.set(key, [c]);
		}
	}

	const files: IDroxCodebaseCatalogFile[] = [];
	for (const [path, fileChunks] of [...byPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		const catalogChunks: IDroxCodebaseCatalogChunk[] = fileChunks
			.slice()
			.sort((a, b) => a.startLine - b.startLine)
			.map(c => ({
				id: c.id,
				startLine: c.startLine,
				endLine: c.endLine,
				preview: previewText(c.text),
				textBytes: c.text.length,
				hasVector: vectorIds.has(c.id),
			}));
		const textBytes = catalogChunks.reduce((n, c) => n + c.textBytes, 0);
		const vectorCount = catalogChunks.filter(c => c.hasVector).length;
		files.push({
			path,
			chunkCount: catalogChunks.length,
			vectorCount,
			textBytes,
			chunks: catalogChunks,
		});
	}

	return {
		files,
		totalFiles: files.length,
		totalChunks: chunks.length,
		totalVectors: vectors.length,
		textBytes: files.reduce((n, f) => n + f.textBytes, 0),
	};
}

/**
 * Remove indexed paths (relative) from chunk + vector rows — no orphans by chunkId.
 */
export function droxCodebaseDeleteCatalogPaths(
	chunks: readonly IDroxCodebaseChunk[],
	vectors: readonly IDroxCodebaseVectorRow[],
	relativePaths: readonly string[],
): { readonly chunks: readonly IDroxCodebaseChunk[]; readonly vectors: readonly IDroxCodebaseVectorRow[]; readonly removedChunks: number; readonly removedVectors: number } {
	const remove = new Set(relativePaths.map(normalizeCatalogPath).filter(Boolean));
	if (remove.size === 0) {
		return { chunks, vectors, removedChunks: 0, removedVectors: 0 };
	}
	const nextChunks = chunks.filter(c => !remove.has(normalizeCatalogPath(c.path)));
	const keepIds = new Set(nextChunks.map(c => c.id));
	const nextVectors = vectors.filter(v => keepIds.has(v.chunkId) && !remove.has(normalizeCatalogPath(v.path)));
	return {
		chunks: nextChunks,
		vectors: nextVectors,
		removedChunks: chunks.length - nextChunks.length,
		removedVectors: vectors.length - nextVectors.length,
	};
}

/**
 * Drop vector rows whose chunkId is missing (orphan cleanup for compact).
 */
export function droxCodebasePruneOrphanVectors(
	chunks: readonly IDroxCodebaseChunk[],
	vectors: readonly IDroxCodebaseVectorRow[],
): { readonly vectors: readonly IDroxCodebaseVectorRow[]; readonly removed: number } {
	const ids = new Set(chunks.map(c => c.id));
	const next = vectors.filter(v => ids.has(v.chunkId));
	return { vectors: next, removed: vectors.length - next.length };
}
