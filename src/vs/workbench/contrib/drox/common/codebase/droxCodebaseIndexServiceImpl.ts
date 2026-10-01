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
	IDroxCodebaseManifest,
} from './droxCodebaseJsonStore.js';
import { droxCodebaseLexicalSearch } from './droxCodebaseLexicalSearch.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';
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

	private _embedDeps() {
		return {
			fileService: this.fileService,
			logService: this.logService,
			embedClient: this._embedClient,
			pipeline: this._pipeline,
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
		});
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
		const lexical = opts?.includeLexical !== false
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
				const modelPath = await resolveDroxEmbedModelPath(this.fileService, this._embedDeps().resolveOpts);
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

	async invalidate(workspaceRoot: URI, paths: readonly URI[]): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		if (this._paused.has(rootKey) || !paths.length) {
			return;
		}
		return this._enqueue(rootKey, async () => {
			if (this._paused.has(rootKey)) {
				return;
			}
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
}

/** @internal exported for tests */
export function droxCodebaseChunksContentEqualForTest(a: readonly IDroxCodebaseChunk[], b: readonly IDroxCodebaseChunk[]): boolean {
	return droxCodebaseChunksContentEqual(a, b);
}
