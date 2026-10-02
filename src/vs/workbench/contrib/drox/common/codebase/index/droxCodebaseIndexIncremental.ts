/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, relativePath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { droxCodebaseChunkText, IDroxCodebaseChunk } from '../droxCodebaseChunker.js';
import { droxCodebaseShouldSkipDirName, droxCodebaseShouldSkipFileName } from '../droxCodebaseIgnore.js';
import {
	droxCodebaseReadChunks,
	droxCodebaseReadManifest,
	droxCodebaseReadVectors,
	droxCodebaseWriteStore,
} from '../droxCodebaseJsonStore.js';
import { IDroxCodebaseVectorRow } from '../droxCodebaseHybrid.js';
import { droxCodebaseMergeEmbed, IDroxCodebaseIndexEmbedDeps } from './droxCodebaseIndexEmbed.js';
import { DroxCodebaseIndexPipelineEmitter } from './droxCodebaseIndexPipelineEmit.js';
import {
	DROX_CODEBASE_MAX_FILE_BYTES,
	droxCodebaseChunksContentEqual,
	droxCodebaseCollectFiles,
	droxCodebaseGroupChunksByPath,
	droxCodebaseJoinWorkspacePath,
	droxCodebaseRelativePosix,
} from './droxCodebaseIndexScan.js';
import { droxCodebasePathMatchesExclusion, droxCodebaseReadExclusions } from '../droxCodebaseExclusions.js';

export async function droxCodebaseRunEnsureIndexed(opts: {
	readonly fileService: IFileService;
	readonly logService: ILogService;
	readonly workspaceRoot: URI;
	readonly rootKey: string;
	readonly isPaused: () => boolean;
	readonly pipeline: DroxCodebaseIndexPipelineEmitter;
	readonly embedDeps: IDroxCodebaseIndexEmbedDeps;
	readonly setCaches: (chunks: readonly IDroxCodebaseChunk[], vectors: readonly IDroxCodebaseVectorRow[]) => void;
}): Promise<void> {
	const { fileService, logService, workspaceRoot, rootKey, pipeline } = opts;
	pipeline.beginRun('ensureIndexed');
	try {
		pipeline.emit('scan', 'running', 'Scanning workspace files…', { detail: { progressPct: 5 } });
		const existingChunks = await droxCodebaseReadChunks(fileService, rootKey);
		const existingVectors = await droxCodebaseReadVectors(fileService, rootKey);
		const byPath = droxCodebaseGroupChunksByPath(existingChunks);
		const vectorByChunkId = new Map(existingVectors.map(v => [v.chunkId, v]));
		const exclusions = await droxCodebaseReadExclusions(fileService, rootKey);

		const scanned = await droxCodebaseCollectFiles(fileService, workspaceRoot);
		const files = scanned.filter(f => !droxCodebasePathMatchesExclusion(
			droxCodebaseRelativePosix(workspaceRoot, f),
			exclusions.globs,
		));
		pipeline.emit('scan', 'ok', `Found ${files.length} candidate files (${scanned.length - files.length} excluded)`, {
			detail: { files: files.length, excluded: scanned.length - files.length, progressPct: 15 },
		});

		const outChunks: IDroxCodebaseChunk[] = [];
		const needEmbed: IDroxCodebaseChunk[] = [];
		const reusedVectors: IDroxCodebaseVectorRow[] = [];
		let reusedFiles = 0;
		let rewrittenFiles = 0;

		pipeline.emit('chunk', 'running', 'Chunking files (skip unchanged hashes)…', { detail: { progressPct: 20 } });
		for (let i = 0; i < files.length; i++) {
			const file = files[i]!;
			if (opts.isPaused()) {
				break;
			}
			try {
				const stat = await fileService.stat(file);
				if (typeof stat.size === 'number' && stat.size > DROX_CODEBASE_MAX_FILE_BYTES) {
					continue;
				}
				const content = (await fileService.readFile(file)).value.toString();
				const rel = droxCodebaseRelativePosix(workspaceRoot, file);
				const newChunks = droxCodebaseChunkText(rel, content);
				const old = byPath.get(rel) ?? [];
				if (droxCodebaseChunksContentEqual(old, newChunks)) {
					outChunks.push(...old);
					reusedFiles++;
					if (old.some(c => !vectorByChunkId.has(c.id))) {
						needEmbed.push(...old);
					} else {
						for (const c of old) {
							const v = vectorByChunkId.get(c.id);
							if (v) {
								reusedVectors.push(v);
							}
						}
					}
				} else {
					outChunks.push(...newChunks);
					needEmbed.push(...newChunks);
					rewrittenFiles++;
				}
				if (i === 0 || (i + 1) % 25 === 0 || i === files.length - 1) {
					const pct = 20 + Math.round(((i + 1) / Math.max(1, files.length)) * 35);
					pipeline.emit('chunk', 'running', `Chunked ${i + 1}/${files.length} files`, {
						path: rel,
						detail: { progressPct: pct, reusedFiles, rewrittenFiles, chunks: outChunks.length },
					});
				}
			} catch (err) {
				logService.trace(`[drox-codebase] skip ${file.fsPath}: ${err}`);
				pipeline.emit('skip', 'warn', `Skipped unreadable file`, { path: file.fsPath });
			}
		}
		pipeline.emit('chunk', 'ok', `Chunk pass done — ${outChunks.length} chunks (${reusedFiles} unchanged, ${rewrittenFiles} rewritten)`, {
			detail: { progressPct: 55, chunks: outChunks.length, reusedFiles, rewrittenFiles, needEmbed: needEmbed.length },
		});

		const previousManifest = await droxCodebaseReadManifest(fileService, rootKey);
		const embedMeta = await droxCodebaseMergeEmbed(opts.embedDeps, needEmbed, reusedVectors, previousManifest?.embedModelPath);
		pipeline.emit('upsert', 'running', 'Writing store (chunks + vectors)…', { detail: { progressPct: 90 } });
		await droxCodebaseWriteStore(fileService, rootKey, outChunks, embedMeta
			? { vectors: embedMeta.vectors, embedDimensions: embedMeta.dimensions, embedModelPath: embedMeta.modelPath }
			: undefined);
		opts.setCaches(outChunks, embedMeta?.vectors ?? []);
		pipeline.emit('upsert', 'ok', `Store written — ${embedMeta?.vectors.length ?? 0} vectors`, {
			detail: { progressPct: 96, chunks: outChunks.length, vectors: embedMeta?.vectors.length ?? 0, dimensions: embedMeta?.dimensions },
		});
		logService.info(`[drox-codebase] ensureIndexed ${outChunks.length} chunks (${reusedFiles} unchanged, ${rewrittenFiles} rewritten), ${embedMeta?.vectors.length ?? 0} vectors → ${rootKey}`);
		pipeline.endRun(true, `Index ready — ${outChunks.length} chunks, ${embedMeta?.vectors.length ?? 0} vectors`, {
			chunks: outChunks.length,
			vectors: embedMeta?.vectors.length ?? 0,
			files: files.length,
		});
	} catch (err) {
		pipeline.endRun(false, `Index failed: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
}

export async function droxCodebaseRunInvalidate(opts: {
	readonly fileService: IFileService;
	readonly logService: ILogService;
	readonly workspaceRoot: URI;
	readonly rootKey: string;
	readonly paths: readonly URI[];
	readonly isPaused: () => boolean;
	readonly pipeline: DroxCodebaseIndexPipelineEmitter;
	readonly embedDeps: IDroxCodebaseIndexEmbedDeps;
	readonly setCaches: (chunks: readonly IDroxCodebaseChunk[], vectors: readonly IDroxCodebaseVectorRow[]) => void;
}): Promise<void> {
	const { fileService, logService, workspaceRoot, rootKey, paths, pipeline } = opts;
	pipeline.beginRun('incremental');
	try {
		const exclusions = await droxCodebaseReadExclusions(fileService, rootKey);
		const relPaths = new Set<string>();
		for (const p of paths) {
			const rel = relativePath(workspaceRoot, p);
			if (!rel) {
				continue;
			}
			const norm = rel.replace(/\\/g, '/');
			if (norm.startsWith('.drox/') || norm.split('/').some(seg => droxCodebaseShouldSkipDirName(seg))) {
				continue;
			}
			if (droxCodebaseShouldSkipFileName(basename(p))) {
				continue;
			}
			if (droxCodebasePathMatchesExclusion(norm, exclusions.globs)) {
				// Drop from store if previously indexed; do not re-chunk.
				relPaths.add(norm);
				pipeline.emit('skip', 'ok', `Excluded from index`, { path: norm });
				continue;
			}
			relPaths.add(norm);
		}
		if (!relPaths.size) {
			pipeline.endRun(true, 'Incremental: nothing to update (ignored paths)');
			return;
		}

		pipeline.emit('invalidate', 'running', `Invalidate ${relPaths.size} path(s)`, {
			detail: { paths: relPaths.size, progressPct: 10 },
		});

		const existingChunks = [...await droxCodebaseReadChunks(fileService, rootKey)];
		const existingVectors = [...await droxCodebaseReadVectors(fileService, rootKey)];
		const keptChunks = existingChunks.filter(c => !relPaths.has(c.path));
		const keptVectors = existingVectors.filter(v => !relPaths.has(v.path));
		const newChunks: IDroxCodebaseChunk[] = [];

		for (const rel of relPaths) {
			if (droxCodebasePathMatchesExclusion(rel, exclusions.globs)) {
				pipeline.emit('skip', 'ok', `Removed from index (excluded)`, { path: rel });
				continue;
			}
			const file = droxCodebaseJoinWorkspacePath(workspaceRoot, rel);
			try {
				if (!(await fileService.exists(file))) {
					pipeline.emit('skip', 'ok', `Removed from index (deleted)`, { path: rel });
					continue;
				}
				const stat = await fileService.stat(file);
				if (typeof stat.size === 'number' && stat.size > DROX_CODEBASE_MAX_FILE_BYTES) {
					continue;
				}
				if (stat.isDirectory) {
					continue;
				}
				const content = (await fileService.readFile(file)).value.toString();
				newChunks.push(...droxCodebaseChunkText(rel, content));
				pipeline.emit('chunk', 'ok', `Re-chunked`, { path: rel, detail: { chunks: newChunks.length } });
			} catch (err) {
				logService.trace(`[drox-codebase] invalidate skip ${rel}: ${err}`);
				pipeline.emit('skip', 'warn', `Invalidate skip: ${err}`, { path: rel });
			}
		}

		const previousManifest = await droxCodebaseReadManifest(fileService, rootKey);
		const outChunks = [...keptChunks, ...newChunks];
		const embedMeta = await droxCodebaseMergeEmbed(opts.embedDeps, newChunks, keptVectors, previousManifest?.embedModelPath);
		pipeline.emit('upsert', 'running', 'Writing incremental store…', { detail: { progressPct: 90 } });
		await droxCodebaseWriteStore(fileService, rootKey, outChunks, embedMeta
			? { vectors: embedMeta.vectors, embedDimensions: embedMeta.dimensions, embedModelPath: embedMeta.modelPath }
			: undefined);
		opts.setCaches(outChunks, embedMeta?.vectors ?? []);
		pipeline.emit('upsert', 'ok', `Incremental store written`, {
			detail: { chunks: outChunks.length, vectors: embedMeta?.vectors.length ?? 0, progressPct: 96 },
		});
		logService.info(`[drox-codebase] invalidate ${relPaths.size} path(s) → ${outChunks.length} chunks, ${embedMeta?.vectors.length ?? 0} vectors`);
		pipeline.endRun(true, `Incremental done — ${relPaths.size} path(s)`, {
			paths: relPaths.size,
			chunks: outChunks.length,
			vectors: embedMeta?.vectors.length ?? 0,
		});
	} catch (err) {
		pipeline.endRun(false, `Incremental failed: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
}
