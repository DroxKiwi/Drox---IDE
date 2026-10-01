/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IDroxEngineService } from '../droxEngineService.js';
import { DroxSetting } from '../droxConfiguration.js';
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
import {
	IDroxCodebaseHit,
	IDroxCodebasePipelineEvent,
	IDroxCodebasePipelineEventStatus,
	DroxCodebasePipelineStepKind,
} from './droxCodebaseTypes.js';

/** Encode texts in batches to keep RPC payloads and RAM bounded. */
const EMBED_BATCH_SIZE = 32;

/**
 * Walk workspace → chunk → JSON store under `.drox/codebase-index/`.
 * CB1 lexical; CB2 embed vectors + hybrid; CB2b incremental invalidate + hash skip + pipeline events.
 */
export class DroxCodebaseIndexService extends Disposable implements IDroxCodebaseIndexService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidPipelineEvent = this._register(new Emitter<IDroxCodebasePipelineEvent>());
	readonly onDidPipelineEvent = this._onDidPipelineEvent.event;

	private readonly _paused = new Set<string>();
	private readonly _chunksCache = new Map<string, readonly IDroxCodebaseChunk[]>();
	private readonly _vectorsCache = new Map<string, readonly IDroxCodebaseVectorRow[]>();
	/** Serialize index writes per workspace root. */
	private readonly _rootChain = new Map<string, Promise<void>>();
	private readonly _embedClient: DroxCodebaseEmbedClient;
	private _eventSeq = 0;
	private _activeRunId: string | undefined;

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

	private _emit(
		kind: DroxCodebasePipelineStepKind,
		status: IDroxCodebasePipelineEventStatus,
		message: string,
		opts?: { readonly path?: string; readonly detail?: IDroxCodebasePipelineEvent['detail']; readonly runId?: string },
	): void {
		const runId = opts?.runId ?? this._activeRunId ?? `run-${Date.now()}`;
		this._onDidPipelineEvent.fire({
			id: `evt-${++this._eventSeq}`,
			at: Date.now(),
			runId,
			kind,
			status,
			message,
			path: opts?.path,
			detail: opts?.detail,
		});
	}

	private _beginRun(trigger: string): string {
		const runId = `run-${Date.now()}-${++this._eventSeq}`;
		this._activeRunId = runId;
		this._emit('run_start', 'running', `Run started (${trigger})`, {
			runId,
			detail: { trigger, progressPct: 0 },
		});
		return runId;
	}

	private _endRun(ok: boolean, message: string, detail?: IDroxCodebasePipelineEvent['detail']): void {
		this._emit(ok ? 'run_done' : 'error', ok ? 'ok' : 'error', message, {
			detail: { ...detail, progressPct: ok ? 100 : detail?.progressPct },
		});
		this._activeRunId = undefined;
	}

	private _customEmbedPath(): string | undefined {
		const raw = this.configurationService.getValue<string>(DroxSetting.CodebaseEmbedModelPath);
		const trimmed = typeof raw === 'string' ? raw.trim() : '';
		return trimmed || undefined;
	}

	private _embedResolveOpts(customPath?: string) {
		return {
			customPath,
			appRoot: this.environmentService.appRoot,
			userDataPath: this.environmentService.userDataPath,
		};
	}

	private _enqueue(rootKey: string, op: () => Promise<void>): Promise<void> {
		const prev = this._rootChain.get(rootKey) ?? Promise.resolve();
		const next = prev.then(op, op);
		this._rootChain.set(rootKey, next.then(() => undefined, () => undefined));
		return next;
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
			this._beginRun('ensureIndexed');
			try {
				this._emit('scan', 'running', 'Scanning workspace files…', { detail: { progressPct: 5 } });
				const existingChunks = await droxCodebaseReadChunks(this.fileService, rootKey);
				const existingVectors = await droxCodebaseReadVectors(this.fileService, rootKey);
				const byPath = groupChunksByPath(existingChunks);
				const vectorByChunkId = new Map(existingVectors.map(v => [v.chunkId, v]));

				const files = await this._collectFiles(workspaceRoot);
				this._emit('scan', 'ok', `Found ${files.length} candidate files`, {
					detail: { files: files.length, progressPct: 15 },
				});

				const outChunks: IDroxCodebaseChunk[] = [];
				const needEmbed: IDroxCodebaseChunk[] = [];
				const reusedVectors: IDroxCodebaseVectorRow[] = [];
				let reusedFiles = 0;
				let rewrittenFiles = 0;

				this._emit('chunk', 'running', 'Chunking files (skip unchanged hashes)…', { detail: { progressPct: 20 } });
				for (let i = 0; i < files.length; i++) {
					const file = files[i]!;
					if (this._paused.has(rootKey)) {
						break;
					}
					try {
						const stat = await this.fileService.stat(file);
						if (typeof stat.size === 'number' && stat.size > DROX_CODEBASE_MAX_FILE_BYTES) {
							continue;
						}
						const content = (await this.fileService.readFile(file)).value.toString();
						const rel = (relativePath(workspaceRoot, file) ?? file.fsPath).replace(/\\/g, '/');
						const newChunks = droxCodebaseChunkText(rel, content);
						const old = byPath.get(rel) ?? [];
						const same = chunksContentEqual(old, newChunks);
						if (same) {
							outChunks.push(...old);
							reusedFiles++;
							const missingVector = old.some(c => !vectorByChunkId.has(c.id));
							if (missingVector) {
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
							this._emit('chunk', 'running', `Chunked ${i + 1}/${files.length} files`, {
								path: rel,
								detail: { progressPct: pct, reusedFiles, rewrittenFiles, chunks: outChunks.length },
							});
						}
					} catch (err) {
						this.logService.trace(`[drox-codebase] skip ${file.fsPath}: ${err}`);
						this._emit('skip', 'warn', `Skipped unreadable file`, { path: file.fsPath });
					}
				}
				this._emit('chunk', 'ok', `Chunk pass done — ${outChunks.length} chunks (${reusedFiles} unchanged, ${rewrittenFiles} rewritten)`, {
					detail: { progressPct: 55, chunks: outChunks.length, reusedFiles, rewrittenFiles, needEmbed: needEmbed.length },
				});

				const previousManifest = await droxCodebaseReadManifest(this.fileService, rootKey);
				const embedMeta = await this._mergeEmbed(needEmbed, reusedVectors, previousManifest?.embedModelPath);
				this._emit('upsert', 'running', 'Writing store (chunks + vectors)…', { detail: { progressPct: 90 } });
				await droxCodebaseWriteStore(this.fileService, rootKey, outChunks, embedMeta
					? {
						vectors: embedMeta.vectors,
						embedDimensions: embedMeta.dimensions,
						embedModelPath: embedMeta.modelPath,
					}
					: undefined);
				this._chunksCache.set(rootKey, outChunks);
				this._vectorsCache.set(rootKey, embedMeta?.vectors ?? []);
				this._emit('upsert', 'ok', `Store written — ${embedMeta?.vectors.length ?? 0} vectors`, {
					detail: {
						progressPct: 96,
						chunks: outChunks.length,
						vectors: embedMeta?.vectors.length ?? 0,
						dimensions: embedMeta?.dimensions,
					},
				});
				this.logService.info(`[drox-codebase] ensureIndexed ${outChunks.length} chunks (${reusedFiles} unchanged files, ${rewrittenFiles} rewritten), ${embedMeta?.vectors.length ?? 0} vectors → ${rootKey}`);
				this._endRun(true, `Index ready — ${outChunks.length} chunks, ${embedMeta?.vectors.length ?? 0} vectors`, {
					chunks: outChunks.length,
					vectors: embedMeta?.vectors.length ?? 0,
					files: files.length,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this._endRun(false, `Index failed: ${msg}`);
				throw err;
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
				const modelPath = await resolveDroxEmbedModelPath(this.fileService, this._embedResolveOpts(this._customEmbedPath()));
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
			this._beginRun('incremental');
			try {
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
					relPaths.add(norm);
				}
				if (!relPaths.size) {
					this._endRun(true, 'Incremental: nothing to update (ignored paths)');
					return;
				}

				this._emit('invalidate', 'running', `Invalidate ${relPaths.size} path(s)`, {
					detail: { paths: relPaths.size, progressPct: 10 },
				});

				const existingChunks = [...await droxCodebaseReadChunks(this.fileService, rootKey)];
				const existingVectors = [...await droxCodebaseReadVectors(this.fileService, rootKey)];
				const keptChunks = existingChunks.filter(c => !relPaths.has(c.path));
				const keptVectors = existingVectors.filter(v => !relPaths.has(v.path));
				const newChunks: IDroxCodebaseChunk[] = [];

				for (const rel of relPaths) {
					const file = joinWorkspacePath(workspaceRoot, rel);
					try {
						if (!(await this.fileService.exists(file))) {
							this._emit('skip', 'ok', `Removed from index (deleted)`, { path: rel });
							continue;
						}
						const stat = await this.fileService.stat(file);
						if (typeof stat.size === 'number' && stat.size > DROX_CODEBASE_MAX_FILE_BYTES) {
							continue;
						}
						if (stat.isDirectory) {
							continue;
						}
						const content = (await this.fileService.readFile(file)).value.toString();
						newChunks.push(...droxCodebaseChunkText(rel, content));
						this._emit('chunk', 'ok', `Re-chunked`, { path: rel, detail: { chunks: newChunks.length } });
					} catch (err) {
						this.logService.trace(`[drox-codebase] invalidate skip ${rel}: ${err}`);
						this._emit('skip', 'warn', `Invalidate skip: ${err}`, { path: rel });
					}
				}

				const previousManifest = await droxCodebaseReadManifest(this.fileService, rootKey);
				const outChunks = [...keptChunks, ...newChunks];
				const embedMeta = await this._mergeEmbed(newChunks, keptVectors, previousManifest?.embedModelPath);
				this._emit('upsert', 'running', 'Writing incremental store…', { detail: { progressPct: 90 } });
				await droxCodebaseWriteStore(this.fileService, rootKey, outChunks, embedMeta
					? {
						vectors: embedMeta.vectors,
						embedDimensions: embedMeta.dimensions,
						embedModelPath: embedMeta.modelPath,
					}
					: undefined);
				this._chunksCache.set(rootKey, outChunks);
				this._vectorsCache.set(rootKey, embedMeta?.vectors ?? []);
				this._emit('upsert', 'ok', `Incremental store written`, {
					detail: { chunks: outChunks.length, vectors: embedMeta?.vectors.length ?? 0, progressPct: 96 },
				});
				this.logService.info(`[drox-codebase] invalidate ${relPaths.size} path(s) → ${outChunks.length} chunks, ${embedMeta?.vectors.length ?? 0} vectors`);
				this._endRun(true, `Incremental done — ${relPaths.size} path(s)`, {
					paths: relPaths.size,
					chunks: outChunks.length,
					vectors: embedMeta?.vectors.length ?? 0,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this._endRun(false, `Incremental failed: ${msg}`);
				throw err;
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

	private async _mergeEmbed(
		needEmbed: readonly IDroxCodebaseChunk[],
		reusedVectors: readonly IDroxCodebaseVectorRow[],
		fallbackModelPath: string | undefined,
	): Promise<{ vectors: IDroxCodebaseVectorRow[]; dimensions: number; modelPath: string } | undefined> {
		if (!needEmbed.length) {
			if (!reusedVectors.length) {
				this._emit('embed_batch', 'ok', 'Embed skipped — nothing new to encode (reused vectors only or lexical)', {
					detail: { progressPct: 80, reusedVectors: 0 },
				});
				return undefined;
			}
			const modelPath = await resolveDroxEmbedModelPath(this.fileService, this._embedResolveOpts(this._customEmbedPath()))
				?? fallbackModelPath
				?? 'local';
			this._emit('embed_batch', 'ok', `Reused ${reusedVectors.length} vectors (no re-encode)`, {
				detail: { progressPct: 85, reusedVectors: reusedVectors.length },
			});
			return {
				vectors: [...reusedVectors],
				dimensions: reusedVectors[0]!.values.length,
				modelPath,
			};
		}
		const embedded = await this._tryEmbedChunks(needEmbed);
		if (!embedded) {
			if (!reusedVectors.length) {
				this._emit('embed_batch', 'warn', 'Embed unavailable — lexical-only for new chunks', {
					detail: { progressPct: 85, needEmbed: needEmbed.length },
				});
				return undefined;
			}
			this._emit('embed_batch', 'warn', `Embed failed for new chunks — kept ${reusedVectors.length} old vectors`, {
				detail: { progressPct: 85, reusedVectors: reusedVectors.length },
			});
			return {
				vectors: [...reusedVectors],
				dimensions: reusedVectors[0]!.values.length,
				modelPath: fallbackModelPath ?? 'local',
			};
		}
		return {
			vectors: [...reusedVectors, ...embedded.vectors],
			dimensions: embedded.dimensions,
			modelPath: embedded.modelPath,
		};
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
				this._emit('embed_load', 'warn', 'Embed runtime not built in drox.exe', { detail: { progressPct: 60 } });
				return undefined;
			}
			let modelPath = st.modelPath;
			if (!st.modelLoaded || !modelPath) {
				this._emit('embed_load', 'running', 'Loading MiniLM GGUF…', { detail: { progressPct: 60 } });
				modelPath = await resolveDroxEmbedModelPath(this.fileService, this._embedResolveOpts(this._customEmbedPath()));
				if (!modelPath) {
					this.logService.info('[drox-codebase] embed built but no GGUF found — lexical-only index');
					this._emit('embed_load', 'warn', 'No GGUF found — lexical-only', { detail: { progressPct: 65 } });
					return undefined;
				}
				await this._embedClient.load(modelPath);
				this._emit('embed_load', 'ok', `Model loaded`, { path: modelPath, detail: { progressPct: 68 } });
			} else {
				this._emit('embed_load', 'ok', `Model already loaded`, { path: modelPath, detail: { progressPct: 68 } });
			}
			const vectors: IDroxCodebaseVectorRow[] = [];
			let dimensions = 0;
			const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE);
			for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
				const batchIndex = Math.floor(i / EMBED_BATCH_SIZE) + 1;
				const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
				const texts = batch.map(c => c.text.slice(0, 2000));
				const pct = 68 + Math.round((batchIndex / Math.max(1, totalBatches)) * 20);
				this._emit('embed_batch', 'running', `Encode batch ${batchIndex}/${totalBatches} (${batch.length} chunks)`, {
					detail: { progressPct: pct, batch: batchIndex, batches: totalBatches },
				});
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
				this._emit('embed_batch', 'warn', 'Encode returned no vectors', { detail: { progressPct: 88 } });
				return undefined;
			}
			this._emit('embed_batch', 'ok', `Encoded ${vectors.length} vectors (${dimensions} dims)`, {
				detail: { progressPct: 88, vectors: vectors.length, dimensions },
			});
			return { vectors, dimensions, modelPath };
		} catch (err) {
			this.logService.warn(`[drox-codebase] embed encode skipped: ${err}`);
			this._emit('embed_batch', 'error', `Encode error: ${err}`, { detail: { progressPct: 70 } });
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

function groupChunksByPath(chunks: readonly IDroxCodebaseChunk[]): Map<string, IDroxCodebaseChunk[]> {
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

function chunksContentEqual(a: readonly IDroxCodebaseChunk[], b: readonly IDroxCodebaseChunk[]): boolean {
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

function joinWorkspacePath(root: URI, relPosix: string): URI {
	const parts = relPosix.split('/').filter(Boolean);
	return URI.joinPath(root, ...parts);
}

/** @internal exported for tests */
export function droxCodebaseChunksContentEqualForTest(a: readonly IDroxCodebaseChunk[], b: readonly IDroxCodebaseChunk[]): boolean {
	return chunksContentEqual(a, b);
}
