/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { droxCodebaseChunkText, IDroxCodebaseChunk } from './droxCodebaseChunker.js';
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
	droxCodebaseWriteStore,
	IDroxCodebaseManifest,
} from './droxCodebaseJsonStore.js';
import { droxCodebaseLexicalSearch } from './droxCodebaseLexicalSearch.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';

/**
 * CB1: walk workspace → chunk → JSON store under `.drox/codebase-index/`.
 * Lexical search only (embed = CB2).
 */
export class DroxCodebaseIndexService extends Disposable implements IDroxCodebaseIndexService {

	declare readonly _serviceBrand: undefined;

	private readonly _paused = new Set<string>();
	private readonly _chunksCache = new Map<string, readonly IDroxCodebaseChunk[]>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
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

		await droxCodebaseWriteStore(this.fileService, rootKey, chunks);
		this._chunksCache.set(rootKey, chunks);
		this.logService.info(`[drox-codebase] indexed ${chunks.length} chunks from ${files.length} files → ${rootKey}`);
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
		return droxCodebaseLexicalSearch(filtered, query, opts?.maxResults ?? 12);
	}

	async invalidate(workspaceRoot: URI, _paths: readonly URI[]): Promise<void> {
		this._chunksCache.delete(workspaceRoot.fsPath);
		// CB1: full reindex on next ensureIndexed (incremental later)
	}

	async purge(workspaceRoot: URI): Promise<void> {
		const rootKey = workspaceRoot.fsPath;
		this._chunksCache.delete(rootKey);
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
