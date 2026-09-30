/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DroxCodebaseIndexState = 'missing' | 'idle' | 'indexing' | 'paused' | 'error';

export type DroxCodebaseRetrievalMode = 'lexical' | 'hybrid';

export interface IDroxCodebaseStorageStats {
	readonly files: number;
	readonly chunks: number;
	readonly vectors: number;
	readonly bytes: number;
	readonly softCapBytes: number;
}

export interface IDroxCodebasePipelineStats {
	readonly queueDepth: number;
	readonly currentPath?: string;
	readonly phase?: string;
	readonly chunksPerSec: number;
}

export interface IDroxCodebaseEmbedStats {
	readonly modelId?: string;
	readonly loaded: boolean;
	readonly rssBytes?: number;
	readonly lastProbeMs?: number;
}

export interface IDroxCodebaseAlert {
	readonly id: string;
	readonly severity: 'error' | 'warn' | 'info';
	readonly code: string;
	readonly message: string;
	readonly at: number;
}

/** Live cockpit snapshot — see docs/1.5/1.5.21/codebase/PLAN-COCKPIT.md */
export interface IDroxCodebaseCockpitSnapshot {
	readonly rootFsPath: string | undefined;
	readonly state: DroxCodebaseIndexState;
	readonly storage: IDroxCodebaseStorageStats;
	readonly pipeline: IDroxCodebasePipelineStats;
	readonly embed: IDroxCodebaseEmbedStats;
	readonly alerts: readonly IDroxCodebaseAlert[];
	readonly mode: DroxCodebaseRetrievalMode;
	readonly lastError?: string;
}

export interface IDroxCodebaseHit {
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly score: number;
	readonly symbol?: string;
	readonly preview: string;
}

export function createEmptyCodebaseSnapshot(rootFsPath?: string): IDroxCodebaseCockpitSnapshot {
	return {
		rootFsPath,
		state: rootFsPath ? 'missing' : 'missing',
		storage: { files: 0, chunks: 0, vectors: 0, bytes: 0, softCapBytes: 500 * 1024 * 1024 },
		pipeline: { queueDepth: 0, chunksPerSec: 0 },
		embed: { loaded: false },
		alerts: [],
		mode: 'lexical',
	};
}
