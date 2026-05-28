/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

import { URI } from '../../../../base/common/uri.js';

import { IDroxSessionCompactResult } from './droxSessionCompact.js';

import { IDroxSessionCloseResult, IDroxSessionSearchResult, IDroxStoredContextChunk } from './droxLongMemory.js';



export const IDroxLongMemoryService = createDecorator<IDroxLongMemoryService>('droxLongMemoryService');



export interface IDroxLongMemoryService {

	readonly _serviceBrand: undefined;



	ingestContextChunkSummary(workspaceUri: URI, raw: Record<string, unknown>): Promise<void>;



	ingestFromSessionCompact(

		workspaceUri: URI,

		transcriptSessionId: string,

		res: IDroxSessionCompactResult,

	): Promise<void>;



	searchMemories(workspaceUri: URI, query: string, limit?: number): Promise<IDroxSessionSearchResult>;



	closeSession(

		workspaceUri: URI,

		transcriptSessionId: string,

		farewellHint?: string,

	): Promise<IDroxSessionCloseResult>;



	listChunksForSession(workspaceUri: URI, transcriptSessionId: string): Promise<readonly IDroxStoredContextChunk[]>;

}

