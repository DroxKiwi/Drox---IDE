/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDroxEngineService } from '../droxEngineService.js';
import { droxCodebaseChunkText, IDroxCodebaseChunk } from './droxCodebaseChunker.js';
import { DroxCodebaseEmbedClient } from './droxCodebaseEmbedClient.js';
import { resolveDroxEmbedModelPath } from './droxCodebaseEmbedPaths.js';
import { droxCodebaseHybridMerge, IDroxCodebaseVectorRow } from './droxCodebaseHybrid.js';
import { IDroxCodebaseIndexService, IDroxCodebaseSearchOptions } from './droxCodebaseIndexService.js';
import {
	DROX_CODEBASE_MAX_FILE_BYTES,
	DROX_CODEBASE_MAX_FILES,
	droxCodebaseShouldSkipDirName,
	droxCodebaseShouldSkipFileName,
} from './droxCodebaseIgnore.js';
import {
	droxCodebaseDeleteStore,
	droxCodebaseReadChunks,
	droxCodebaseReadManifest,
	droxCodebaseReadVectors,
	droxCodebaseWriteStore,
	IDroxCodebaseManifest,
} from './droxCodebaseJsonStore.js';
import { droxCodebaseLexicalSearch } from './droxCodebaseLexicalSearch.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';

/** Encode texts in batches to keep RPC payloads and RAM bounded. */
const EMBED_BATCH_SIZE = 32;

/**
 * Walk workspace → chunk → JSON store under `.drox/codebase-index/`.
 * CB1 lexical; CB2 optional embed vectors + hybrid search when drox.exe has `--features embed`.
 */
export class DroxCodebaseIndexService extends Disposable implements IDroxCodebaseIndexService {

	declare readonly _serviceBrand: undefined;

	private readonly _paused = new Set<string>();
	private readonly _chunksCache = new Map<string, readonly IDroxCodebaseChunk[]>();
	private readonly _vectorsCache = new Map<string, readonly IDroxCodebaseVectorRow[]>();
	private readonly _embedClient: DroxCodebaseEmbedClient;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IDroxEngineService engineService: IDroxEngineService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super();
		this._embedClient = new DroxCodebaseEmbedClient(engineService);
	}

	async ensureIndexed(workspaceRoot: URI): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		if (this._paused.has(rootKey)) {
			return;
		}

		const chunks: IDroxCodebaseChunk[] = [];
		const files = await this._collectFiles(workspaceRoot);
		for (const file of files) {
			if (this._paused.has(rootKey)) {
				break;
			}
			try {
				const stat = await this.fileService.stat(file);
				if (typeof stat.size === 'number' && stat.size > DROX_CODEBASE_MAX_FILE_BYTES) {
					continue;
				}
				const content = (await this.fileService.readFile(file)).value.toString();
				const rel = relativePath(workspaceRoot, file) ?? file.fsPath;
				chunks.push(...droxCodebaseChunkText(rel.replace(/\\/g, '/'), content));
			} catch (err) {
				this.logService.trace(`[drox-codebase] skip ${file.fsPath}: ${err}`);
			}
		}

		const embed = await this._tryEmbedChunks(chunks);
		await droxCodebaseWriteStore(this.fileService, rootKey, chunks, embed
			? {
				vectors: embed.vectors,
				embedDimensions: embed.dimensions,
				embedModelPath: embed.modelPath,
			}
			: undefined);
		this._chunksCache.set(rootKey, chunks);
		this._vectorsCache.set(rootKey, embed?.vectors ?? []);
		this.logService.info(`[drox-codebase] indexed ${chunks.length} chunks, ${embed?.vectors.length ?? 0} vectors from ${files.length} files → ${rootKey}`);
	}

	async search(workspaceRoot: URI, query: string, opts?: IDroxCodebaseSearchOptions): Promise<readonly IDroxCodebaseHit[]> {
		const rootKey = workspaceRoot.fsPath;
		let chunks = this._chunksCache.get(rootKey);
		if (!chunks) {
			chunks = await droxCodebaseReadChunks(this.fileService, rootKey);
			this._chunksCache.set(rootKey, chunks);
		}
		let filtered = chunks;
		if (opts?.pathPrefix) {
			const prefix = opts.pathPrefix.replace(/\\/g, '/');
			filtered = chunks.filter(c => c.path.startsWith(prefix));
		}
		const maxResults = opts?.maxResults ?? 12;
		const wantLexical = opts?.includeLexical !== false;
		const lexical = wantLexical
			? droxCodebaseLexicalSearch(filtered, query, maxResults)
			: [];

		let vectors = this._vectorsCache.get(rootKey);
		if (vectors === undefined) {
			vectors = await droxCodebaseReadVectors(this.fileService, rootKey);
			this._vectorsCache.set(rootKey, vectors);
		}
		if (!vectors.length) {
			return lexical;
		}

		try {
			const st = await this._embedClient.status();
			if (!st.built) {
				return lexical;
			}
			if (!st.modelLoaded) {
				const modelPath = await resolveDroxEmbedModelPath(this.fileService, this.environmentService);
				if (!modelPath) {
					return lexical;
				}
				await this._embedClient.load(modelPath);
			}
			const encoded = await this._embedClient.encode([query]);
			const queryVector = encoded.vectors[0]?.values;
			if (!queryVector?.length) {
				return lexical;
			}
			const filteredVectors = opts?.pathPrefix
				? vectors.filter(v => v.path.startsWith(opts.pathPrefix!.replace(/\\/g, '/')))
				: vectors;
			return droxCodebaseHybridMerge(lexical, queryVector, filteredVectors, maxResults);
		} catch (err) {
			this.logService.trace(`[drox-codebase] hybrid search fallback: ${err}`);
			return lexical;
		}
	}

	async invalidate(workspaceRoot: URI, _paths: readonly URI[]): Promise<void> {
		this._chunksCache.delete(workspaceRoot.fsPath);
		this._vectorsCache.delete(workspaceRoot.fsPath);
		// CB1/CB2: full reindex on next ensureIndexed (incremental later)
	}

	async purge(workspaceRoot: URI): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		this._chunksCache.delete(rootKey);
		this._vectorsCache.delete(rootKey);
		await droxCodebaseDeleteStore(this.fileService, rootKey);
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

	private async _tryEmbedChunks(chunks: readonly IDroxCodebaseChunk[]): Promise<{
		vectors: IDroxCodebaseVectorRow[];
		dimensions: number;
		modelPath: string;
	} | undefined> {
		if (!chunks.length) {
			return undefined;
		}
		try {
			const st = await this._embedClient.status();
			if (!st.built) {
				return undefined;
			}
			let modelPath = st.modelPath;
			if (!st.modelLoaded || !modelPath) {
				modelPath = await resolveDroxEmbedModelPath(this.fileService, this.environmentService);
				if (!modelPath) {
					this.logService.info('[drox-codebase] embed built but no GGUF found — lexical-only index');
					return undefined;
				}
				await this._embedClient.load(modelPath);
			}
			const vectors: IDroxCodebaseVectorRow[] = [];
			let dimensions = 0;
			for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
				const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
				const texts = batch.map(c => c.text.slice(0, 2000));
				const encoded = await this._embedClient.encode(texts);
				for (let j = 0; j < batch.length; j++) {
					const values = encoded.vectors[j]?.values ?? [];
					if (!values.length) {
						continue;
					}
					dimensions = values.length;
					const chunk = batch[j]!;
					vectors.push({
						chunkId: chunk.id,
						path: chunk.path,
						startLine: chunk.startLine,
						endLine: chunk.endLine,
						preview: chunk.text.slice(0, 160).replace(/\s+/g, ' '),
						values: [...values],
					});
				}
			}
			if (!vectors.length) {
				return undefined;
			}
			return { vectors, dimensions, modelPath };
		} catch (err) {
			this.logService.warn(`[drox-codebase] embed encode skipped: ${err}`);
			return undefined;
		}
	}

	private async _collectFiles(root: URI): Promise<URI[]> {
		const out: URI[] = [];
		await this._walk(root, out);
		return out;
	}

	private async _walk(dir: URI, out: URI[]): Promise<void> {
		if (out.length >= DROX_CODEBASE_MAX_FILES) {
			return;
		}
		let resolved;
		try {
			resolved = await this.fileService.resolve(dir);
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
				await this._walk(child.resource, out);
			} else if (!child.isDirectory) {
				if (droxCodebaseShouldSkipFileName(child.name)) {
					continue;
				}
				out.push(child.resource);
			}
		}
	}
}
