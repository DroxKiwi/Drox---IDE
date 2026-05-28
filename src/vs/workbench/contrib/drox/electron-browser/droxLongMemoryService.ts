/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

import { IFileService } from '../../../../platform/files/common/files.js';

import { ILogService } from '../../../../platform/log/common/log.js';

import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';

import { IDroxSessionCompactResult } from '../common/droxSessionCompact.js';

import { IDroxStoredContextChunk } from '../common/droxLongMemory.js';

import { DroxLongMemoryStore } from './droxLongMemoryStore.js';



export class DroxLongMemoryService implements IDroxLongMemoryService {



	declare readonly _serviceBrand: undefined;



	private readonly stores = new Map<string, Promise<DroxLongMemoryStore>>();



	constructor(

		@IFileService private readonly fileService: IFileService,

		@ILogService private readonly logService: ILogService,

	) { }



	private storeFor(workspaceUri: URI): Promise<DroxLongMemoryStore> {

		const key = workspaceUri.toString();

		let p = this.stores.get(key);

		if (!p) {

			p = Promise.resolve(new DroxLongMemoryStore(

				DroxLongMemoryStore.dbUriForWorkspace(workspaceUri),

				this.fileService,

			));

			this.stores.set(key, p);

		}

		return p;

	}



	async ingestContextChunkSummary(workspaceUri: URI, raw: Record<string, unknown>): Promise<void> {

		try {

			const store = await this.storeFor(workspaceUri);

			await store.ingestContextChunkSummary(raw);

		} catch (e) {

			this.logService.warn('[Drox] long memory ingest chunk', e);

		}

	}



	async ingestFromSessionCompact(

		workspaceUri: URI,

		transcriptSessionId: string,

		res: IDroxSessionCompactResult,

	): Promise<void> {

		try {

			const store = await this.storeFor(workspaceUri);

			await store.ingestFromSessionCompact(workspaceUri.fsPath, transcriptSessionId, res);

		} catch (e) {

			this.logService.warn('[Drox] long memory ingest compact', e);

		}

	}



	async searchMemories(workspaceUri: URI, query: string, limit?: number) {

		const store = await this.storeFor(workspaceUri);

		return store.searchMemories({ query, limit });

	}



	async closeSession(workspaceUri: URI, transcriptSessionId: string, farewellHint?: string) {

		const store = await this.storeFor(workspaceUri);

		return store.closeSession({ transcriptSessionId, farewellHint });

	}



	async listChunksForSession(workspaceUri: URI, transcriptSessionId: string): Promise<readonly IDroxStoredContextChunk[]> {

		const store = await this.storeFor(workspaceUri);

		return store.listChunksForSession(transcriptSessionId);

	}

}

