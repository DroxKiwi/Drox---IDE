/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { DroxSetting } from '../droxConfiguration.js';
import { IDroxEngineService } from '../droxEngineService.js';
import { IDroxCodebaseChunk } from './droxCodebaseChunker.js';
import { DroxCodebaseEmbedClient } from './droxCodebaseEmbedClient.js';
import { resolveDroxEmbedModelPath } from './droxCodebaseEmbedPaths.js';
import { droxCodebaseHybridMerge, IDroxCodebaseVectorRow } from './droxCodebaseHybrid.js';
import { IDroxCodebaseIndexService, IDroxCodebaseSearchOptions } from './droxCodebaseIndexService.js';
import {
	droxCodebaseDeleteStore,
	droxCodebaseReadChunks,
	droxCodebaseReadManifest,
	droxCodebaseReadVectors,
	droxCodebaseWriteStore,
	IDroxCodebaseManifest,
} from './droxCodebaseJsonStore.js';
import {
	buildDroxCodebaseCatalog,
	droxCodebaseDeleteCatalogPaths,
	droxCodebasePruneOrphanVectors,
	IDroxCodebaseCatalog,
	IDroxCodebaseCompactResult,
} from './droxCodebaseCatalog.js';
import {
	droxCodebaseMergeExclusionGlobs,
	droxCodebasePathMatchesExclusion,
	droxCodebaseReadExclusions,
	droxCodebaseWriteExclusions,
} from './droxCodebaseExclusions.js';
import { droxCodebaseJoinWorkspacePath } from './index/droxCodebaseIndexScan.js';
import { droxCodebaseLexicalSearch } from './droxCodebaseLexicalSearch.js';
import { droxCodebaseRerankHits } from './droxCodebaseRerank.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';
import { droxCodebaseShouldSkipFileName } from './droxCodebaseIgnore.js';
import { basename } from '../../../../../base/common/path.js';
import { droxCodebaseRunEnsureIndexed, droxCodebaseRunInvalidate } from './index/droxCodebaseIndexIncremental.js';
import { DroxCodebaseIndexPipelineEmitter } from './index/droxCodebaseIndexPipelineEmit.js';
import { droxCodebaseChunksContentEqual } from './index/droxCodebaseIndexScan.js';

/**
 * Walk workspace → chunk → JSON store under `.drox/codebase-index/`.
 * CB1 lexical; CB2 embed; CB2b incremental + pipeline events.
 * Heavy helpers live under `./index/` (CB2c).
 */
export class DroxCodebaseIndexService extends Disposable implements IDroxCodebaseIndexService {

	declare readonly _serviceBrand: undefined;

	private readonly _pipeline = this._register(new DroxCodebaseIndexPipelineEmitter());
	readonly onDidPipelineEvent = this._pipeline.onDidPipelineEvent;

	private readonly _paused = new Set<string>();
	private readonly _chunksCache = new Map<string, readonly IDroxCodebaseChunk[]>();
	private readonly _vectorsCache = new Map<string, readonly IDroxCodebaseVectorRow[]>();
	private readonly _rootChain = new Map<string, Promise<void>>();
	private readonly _embedClient: DroxCodebaseEmbedClient;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IDroxEngineService engineService: IDroxEngineService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._embedClient = new DroxCodebaseEmbedClient(engineService);
	}

	private _customEmbedPath(): string | undefined {
		const raw = this.configurationService.getValue<string>(DroxSetting.CodebaseEmbedModelPath);
		const trimmed = typeof raw === 'string' ? raw.trim() : '';
		return trimmed || undefined;
	}

	private _isEmbedEnabled(): boolean {
		return this.configurationService.getValue<boolean>(DroxSetting.CodebaseEmbedEnabled) !== false;
	}

	private _embedDeps() {
		return {
			fileService: this.fileService,
			logService: this.logService,
			embedClient: this._embedClient,
			pipeline: this._pipeline,
			embedEnabled: this._isEmbedEnabled(),
			resolveOpts: {
				customPath: this._customEmbedPath(),
				appRoot: this.environmentService.appRoot,
				userDataPath: this.environmentService.userDataPath,
			},
		};
	}

	private _enqueue(rootKey: string, op: () => Promise<void>): Promise<void> {
		const prev = this._rootChain.get(rootKey) ?? Promise.resolve();
		const next = prev.then(op, op);
		this._rootChain.set(rootKey, next.then(() => undefined, () => undefined));
		return next;
	}

	private _setCaches(rootKey: string, chunks: readonly IDroxCodebaseChunk[], vectors: readonly IDroxCodebaseVectorRow[]): void {
		this._chunksCache.set(rootKey, chunks);
		this._vectorsCache.set(rootKey, vectors);
	}

	async ensureIndexed(workspaceRoot: URI): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		if (this._paused.has(rootKey)) {
			return;
		}
		return this._enqueue(rootKey, async () => {
			if (this._paused.has(rootKey)) {
				return;
			}
			this._pipeline.setWorkspaceRoot(rootKey);
			try {
				await droxCodebaseRunEnsureIndexed({
					fileService: this.fileService,
					logService: this.logService,
					workspaceRoot,
					rootKey,
					isPaused: () => this._paused.has(rootKey),
					pipeline: this._pipeline,
					embedDeps: this._embedDeps(),
					setCaches: (chunks, vectors) => this._setCaches(rootKey, chunks, vectors),
				});
			} finally {
				this._pipeline.setWorkspaceRoot(undefined);
			}
		});
	}

	async search(workspaceRoot: URI, query: string, opts?: IDroxCodebaseSearchOptions): Promise<readonly IDroxCodebaseHit[]> {
		const rootKey = workspaceRoot.fsPath;
		let chunks = this._chunksCache.get(rootKey);
		if (!chunks) {
			chunks = await droxCodebaseReadChunks(this.fileService, rootKey);
			this._chunksCache.set(rootKey, chunks);
		}
		let filtered = chunks.filter(c => !droxCodebaseShouldSkipFileName(basename(c.path)));
		if (opts?.pathPrefix) {
			const prefix = opts.pathPrefix.replace(/\\/g, '/');
			filtered = filtered.filter(c => c.path.startsWith(prefix));
		}
		const maxResults = opts?.maxResults ?? 12;
		const candidateCap = Math.min(48, Math.max(maxResults * 3, maxResults));
		const lexical = opts?.includeLexical !== false
			? droxCodebaseLexicalSearch(filtered, query, candidateCap)
			: [];

		let vectors = this._vectorsCache.get(rootKey);
		if (vectors === undefined) {
			vectors = await droxCodebaseReadVectors(this.fileService, rootKey);
			this._vectorsCache.set(rootKey, vectors);
		}
		if (!vectors.length || !this._isEmbedEnabled()) {
			return droxCodebaseRerankHits(lexical, maxResults, rerankOpts(opts));
		}

		try {
			const st = await this._embedClient.status();
			if (!st.built) {
				return droxCodebaseRerankHits(lexical, maxResults, rerankOpts(opts));
			}
			if (!st.modelLoaded) {
				const modelPath = await resolveDroxEmbedModelPath(this.fileService, this._embedDeps().resolveOpts);
				if (!modelPath) {
					return droxCodebaseRerankHits(lexical, maxResults, rerankOpts(opts));
				}
				await this._embedClient.load(modelPath);
			}
			const encoded = await this._embedClient.encode([query]);
			const queryVector = encoded.vectors[0]?.values;
			if (!queryVector?.length) {
				return droxCodebaseRerankHits(lexical, maxResults, rerankOpts(opts));
			}
			const filteredVectors = (opts?.pathPrefix
				? vectors.filter(v => v.path.startsWith(opts.pathPrefix!.replace(/\\/g, '/')))
				: vectors
			).filter(v => !droxCodebaseShouldSkipFileName(basename(v.path)));
			const merged = droxCodebaseHybridMerge(lexical, queryVector, filteredVectors, candidateCap);
			return droxCodebaseRerankHits(merged, maxResults, rerankOpts(opts));
		} catch (err) {
			this.logService.trace(`[drox-codebase] hybrid search fallback: ${err}`);
			return droxCodebaseRerankHits(lexical, maxResults, rerankOpts(opts));
		}
	}

	async invalidate(workspaceRoot: URI, paths: readonly URI[]): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		if (this._paused.has(rootKey) || !paths.length) {
			return;
		}
		return this._enqueue(rootKey, async () => {
			if (this._paused.has(rootKey)) {
				return;
			}
			this._pipeline.setWorkspaceRoot(rootKey);
			try {
				await droxCodebaseRunInvalidate({
					fileService: this.fileService,
					logService: this.logService,
					workspaceRoot,
					rootKey,
					paths,
					isPaused: () => this._paused.has(rootKey),
					pipeline: this._pipeline,
					embedDeps: this._embedDeps(),
					setCaches: (chunks, vectors) => this._setCaches(rootKey, chunks, vectors),
				});
			} finally {
				this._pipeline.setWorkspaceRoot(undefined);
			}
		});
	}

	async purge(workspaceRoot: URI): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		return this._enqueue(rootKey, async () => {
			this._chunksCache.delete(rootKey);
			this._vectorsCache.delete(rootKey);
			await droxCodebaseDeleteStore(this.fileService, rootKey);
		});
	}

	pause(workspaceRoot: URI): void {
		this._paused.add(workspaceRoot.fsPath);
	}

	resume(workspaceRoot: URI): void {
		this._paused.delete(workspaceRoot.fsPath);
	}

	async getManifest(workspaceRoot: URI): Promise<IDroxCodebaseManifest | undefined> {
		return droxCodebaseReadManifest(this.fileService, workspaceRoot.fsPath);
	}

	async listCatalog(workspaceRoot: URI): Promise<IDroxCodebaseCatalog> {
		const rootKey = workspaceRoot.fsPath;
		const chunks = this._chunksCache.get(rootKey) ?? await droxCodebaseReadChunks(this.fileService, rootKey);
		const vectors = this._vectorsCache.get(rootKey) ?? await droxCodebaseReadVectors(this.fileService, rootKey);
		this._setCaches(rootKey, chunks, vectors);
		return buildDroxCodebaseCatalog(chunks, vectors);
	}

	async deleteIndexedPaths(workspaceRoot: URI, relativePaths: readonly string[]): Promise<{ removedChunks: number; removedVectors: number }> {
		const rootKey = workspaceRoot.fsPath;
		let removedChunks = 0;
		let removedVectors = 0;
		await this._enqueue(rootKey, async () => {
			const chunks = this._chunksCache.get(rootKey) ?? await droxCodebaseReadChunks(this.fileService, rootKey);
			const vectors = this._vectorsCache.get(rootKey) ?? await droxCodebaseReadVectors(this.fileService, rootKey);
			const next = droxCodebaseDeleteCatalogPaths(chunks, vectors, relativePaths);
			removedChunks = next.removedChunks;
			removedVectors = next.removedVectors;
			if (removedChunks === 0 && removedVectors === 0) {
				return;
			}
			const prevManifest = await droxCodebaseReadManifest(this.fileService, rootKey);
			const manifest = await droxCodebaseWriteStore(this.fileService, rootKey, next.chunks, {
				vectors: next.vectors,
				embedDimensions: prevManifest?.embedDimensions,
				embedModelPath: prevManifest?.embedModelPath,
			});
			this._setCaches(rootKey, next.chunks, next.vectors);
			this._pipeline.emit(
				'invalidate',
				'ok',
				`Catalogue delete: ${removedChunks} chunks, ${removedVectors} vectors (${manifest.files} files left)`,
				{ runId: `catalog-delete-${Date.now()}`, detail: { removedChunks, removedVectors, files: manifest.files } },
			);
		});
		return { removedChunks, removedVectors };
	}

	async compactStore(workspaceRoot: URI): Promise<IDroxCodebaseCompactResult> {
		const rootKey = workspaceRoot.fsPath;
		let result: IDroxCodebaseCompactResult = {
			bytesBefore: 0,
			bytesAfter: 0,
			files: 0,
			chunks: 0,
			vectors: 0,
			orphanVectorsRemoved: 0,
		};
		await this._enqueue(rootKey, async () => {
			const chunks = this._chunksCache.get(rootKey) ?? await droxCodebaseReadChunks(this.fileService, rootKey);
			const vectors = this._vectorsCache.get(rootKey) ?? await droxCodebaseReadVectors(this.fileService, rootKey);
			const prevManifest = await droxCodebaseReadManifest(this.fileService, rootKey);
			const bytesBefore = prevManifest?.bytes
				?? chunks.reduce((n, c) => n + c.text.length, 0) + vectors.reduce((n, v) => n + v.values.length * 4, 0);
			const pruned = droxCodebasePruneOrphanVectors(chunks, vectors);
			const manifest = await droxCodebaseWriteStore(this.fileService, rootKey, chunks, {
				vectors: pruned.vectors,
				embedDimensions: prevManifest?.embedDimensions,
				embedModelPath: prevManifest?.embedModelPath,
			});
			this._setCaches(rootKey, chunks, pruned.vectors);
			result = {
				bytesBefore,
				bytesAfter: manifest.bytes,
				files: manifest.files,
				chunks: manifest.chunks,
				vectors: manifest.vectors,
				orphanVectorsRemoved: pruned.removed,
			};
			this._pipeline.emit(
				'upsert',
				'ok',
				`Catalogue compact: ${bytesBefore} → ${manifest.bytes} bytes (−${pruned.removed} orphan vectors)`,
				{
					runId: `catalog-compact-${Date.now()}`,
					detail: {
						bytesBefore,
						bytesAfter: manifest.bytes,
						orphanVectorsRemoved: pruned.removed,
					},
				},
			);
		});
		return result;
	}

	async listExclusions(workspaceRoot: URI): Promise<readonly string[]> {
		return (await droxCodebaseReadExclusions(this.fileService, workspaceRoot.fsPath)).globs;
	}

	async setExclusions(workspaceRoot: URI, globs: readonly string[]): Promise<readonly string[]> {
		const written = await droxCodebaseWriteExclusions(this.fileService, workspaceRoot.fsPath, globs);
		return written.globs;
	}

	async excludePaths(workspaceRoot: URI, relativePathsOrGlobs: readonly string[]): Promise<{ globs: readonly string[]; removedChunks: number; removedVectors: number }> {
		const rootKey = workspaceRoot.fsPath;
		const current = await droxCodebaseReadExclusions(this.fileService, rootKey);
		const globs = droxCodebaseMergeExclusionGlobs(current.globs, relativePathsOrGlobs);
		await droxCodebaseWriteExclusions(this.fileService, rootKey, globs);

		const chunks = this._chunksCache.get(rootKey) ?? await droxCodebaseReadChunks(this.fileService, rootKey);
		const toDelete = [...new Set(chunks.map(c => c.path))].filter(p => droxCodebasePathMatchesExclusion(p, globs));
		const deleted = toDelete.length
			? await this.deleteIndexedPaths(workspaceRoot, toDelete)
			: { removedChunks: 0, removedVectors: 0 };
		this._pipeline.emit(
			'invalidate',
			'ok',
			`Exclusions updated (${globs.length} globs) — removed ${deleted.removedChunks} chunks`,
			{ runId: `catalog-exclude-${Date.now()}`, detail: { globs: globs.length, ...deleted } },
		);
		return { globs, ...deleted };
	}

	async rebuildIndexedPaths(workspaceRoot: URI, relativePaths: readonly string[]): Promise<void> {
		const uris = relativePaths
			.map(p => p.replace(/\\/g, '/').replace(/^\.\//, ''))
			.filter(Boolean)
			.map(p => droxCodebaseJoinWorkspacePath(workspaceRoot, p));
		if (!uris.length) {
			return;
		}
		await this.invalidate(workspaceRoot, uris);
	}
}

/** @internal exported for tests */
export function droxCodebaseChunksContentEqualForTest(a: readonly IDroxCodebaseChunk[], b: readonly IDroxCodebaseChunk[]): boolean {
	return droxCodebaseChunksContentEqual(a, b);
}

function rerankOpts(opts?: IDroxCodebaseSearchOptions) {
	return {
		preferCodeFiles: opts?.preferCodeFiles,
		pathPrefixes: opts?.pathPrefixes ?? (opts?.pathPrefix ? [opts.pathPrefix] : undefined),
	};
}
