/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDroxStoredContextChunk {

	readonly schemaVersion: number;

	readonly id: string;

	readonly workspaceFingerprint: string;

	readonly transcriptSessionId: string;

	readonly createdAt: string;

	readonly compactionSeq: number;

	readonly tokensBefore: number;

	readonly tokensAfter: number;

	readonly summaryText: string;

	readonly filesTouched: string[];

	readonly tagsSuggested: string[];

	readonly checkpointMessageId?: string;

	readonly embedding: number[] | null;

}



export interface IDroxStoredSessionClosure {

	readonly schemaVersion: number;

	readonly id: string;

	readonly transcriptSessionId: string;

	readonly closedAt: string;

	readonly summaryGlobal: string;

	readonly contextChunkIds: string[];

	readonly memorySessionSlug?: string;

	readonly embedding: number[] | null;

}



export interface IDroxSessionSearchHit {

	readonly kind: 'context_chunk' | 'session_closure';

	readonly id: string;

	readonly score: number;

	readonly match: 'embedding' | 'lexical';

	readonly transcriptSessionId: string;

	readonly snippet: string;

	readonly createdAt?: string;

	readonly closedAt?: string;

	readonly compactionSeq?: number;

}



export interface IDroxLongMemoryDbV1 {

	readonly version: 1;

	contextChunks: IDroxStoredContextChunk[];

	sessionClosures: IDroxStoredSessionClosure[];

}



export interface IDroxSessionSearchResult {

	readonly hits: IDroxSessionSearchHit[];

	readonly usedEmbedding: boolean;

}



export interface IDroxSessionCloseResult {

	readonly closureId: string;

	readonly chunkCount: number;

}

