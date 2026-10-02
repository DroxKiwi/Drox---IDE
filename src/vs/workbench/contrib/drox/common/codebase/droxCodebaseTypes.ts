/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createEmptyPipelineView } from './droxCodebasePipelineView.js';

export { buildDroxCodebasePipelineView, createEmptyPipelineView } from './droxCodebasePipelineView.js';

export type DroxCodebaseIndexState = 'missing' | 'idle' | 'indexing' | 'paused' | 'error';

export type DroxCodebaseRetrievalMode = 'lexical' | 'hybrid';

/** Why an index/embed run started (shown in cockpit pipeline). */
export type DroxCodebasePipelineTrigger =
	| 'startup'
	| 'reindex'
	| 'auto'
	| 'incremental'
	| 'purge'
	| 'probe'
	| 'manual';

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
	/** CB2b+ live progress 0–100 when a run is active. */
	readonly progressPct?: number;
	readonly runId?: string;
	readonly trigger?: DroxCodebasePipelineTrigger;
}

export type DroxCodebasePipelineStepKind =
	| 'run_start'
	| 'scan'
	| 'chunk'
	| 'skip'
	| 'embed_load'
	| 'embed_batch'
	| 'upsert'
	| 'invalidate'
	| 'search'
	| 'run_done'
	| 'error';

export type DroxCodebasePipelineEventStatus = 'running' | 'ok' | 'warn' | 'error';

/** One step of the vectorization / index pipeline (debug + UI). */
export interface IDroxCodebasePipelineEvent {
	readonly id: string;
	readonly at: number;
	readonly runId: string;
	readonly kind: DroxCodebasePipelineStepKind;
	readonly status: DroxCodebasePipelineEventStatus;
	readonly message: string;
	readonly path?: string;
	readonly detail?: Readonly<Record<string, string | number | boolean | undefined>>;
}

/** Checklist stages for the visual pipeline strip. */
export type DroxCodebasePipelineStageId = 'scan' | 'chunk' | 'embed' | 'write' | 'done';

export interface IDroxCodebasePipelineStage {
	readonly id: DroxCodebasePipelineStageId;
	readonly label: string;
	readonly state: 'pending' | 'active' | 'done' | 'error' | 'skipped';
}

export interface IDroxCodebasePipelineView {
	readonly runId: string | undefined;
	readonly trigger: DroxCodebasePipelineTrigger | undefined;
	readonly stages: readonly IDroxCodebasePipelineStage[];
	readonly events: readonly IDroxCodebasePipelineEvent[];
	readonly progressPct: number;
	readonly currentMessage: string | undefined;
}

/** Why auto-inject produced no packed hits (hint may still be sent). */
export type DroxCodebaseInjectSkip =
	| 'disabled'
	| 'empty_query'
	| 'timeout'
	| 'no_hits'
	| 'error'
	| 'model_skip';

/** Last CB4 auto/force inject — cockpit + diag export. */
export interface IDroxCodebaseLastInject {
	readonly at: number;
	readonly query: string;
	readonly forced: boolean;
	readonly autoEnabled: boolean;
	readonly hitCount: number;
	readonly chars: number;
	readonly ms: number;
	readonly hits: readonly IDroxCodebaseHit[];
	readonly skip?: DroxCodebaseInjectSkip;
	/** Path prefixes applied when force+editor anchored the search. */
	readonly forcePathPrefixes?: readonly string[];
}

/** JSON bundle for Export diag (clipboard / file). */
export interface IDroxCodebaseDiagExport {
	readonly exportedAt: string;
	readonly snapshot: IDroxCodebaseCockpitSnapshot;
	readonly pipeline: IDroxCodebasePipelineView;
	readonly lastProbeHits: readonly IDroxCodebaseHit[];
	readonly lastInject?: IDroxCodebaseLastInject;
}

export interface IDroxCodebaseEmbedStats {
	readonly modelId?: string;
	readonly loaded: boolean;
	readonly rssBytes?: number;
	readonly lastProbeMs?: number;
	/** Absolute path currently resolved for the GGUF (may be unloaded). */
	readonly resolvedPath?: string;
	/** Where the path came from — shown transparently in the cockpit. */
	readonly source?: 'custom' | 'env' | 'bundled' | 'userData' | 'repo' | 'missing';
	/** Setting override path (empty = use app default). */
	readonly customPathSetting?: string;
	readonly dimensions?: number;
	readonly backend?: string;
	readonly built?: boolean;
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
	/** Live pipeline strip + journal (CB2b debug). */
	readonly pipelineView: IDroxCodebasePipelineView;
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
		pipelineView: createEmptyPipelineView(),
	};
}
