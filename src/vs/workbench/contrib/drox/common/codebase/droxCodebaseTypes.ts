/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

/** JSON bundle for Export diag (clipboard / file). */
export interface IDroxCodebaseDiagExport {
	readonly exportedAt: string;
	readonly snapshot: IDroxCodebaseCockpitSnapshot;
	readonly pipeline: IDroxCodebasePipelineView;
	readonly lastProbeHits: readonly IDroxCodebaseHit[];
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

export function createEmptyPipelineView(): IDroxCodebasePipelineView {
	return {
		runId: undefined,
		trigger: undefined,
		stages: [
			{ id: 'scan', label: 'Scan', state: 'pending' },
			{ id: 'chunk', label: 'Chunk', state: 'pending' },
			{ id: 'embed', label: 'Embed', state: 'pending' },
			{ id: 'write', label: 'Write', state: 'pending' },
			{ id: 'done', label: 'Done', state: 'pending' },
		],
		events: [],
		progressPct: 0,
		currentMessage: undefined,
	};
}

/** Derive checklist + progress from a flat event log (newest last). */
export function buildDroxCodebasePipelineView(
	events: readonly IDroxCodebasePipelineEvent[],
	opts?: { readonly maxEvents?: number },
): IDroxCodebasePipelineView {
	const maxEvents = opts?.maxEvents ?? 120;
	const sliced = events.length > maxEvents ? events.slice(events.length - maxEvents) : events;
	const last = sliced[sliced.length - 1];
	const runId = last?.runId;
	const runEvents = runId ? sliced.filter(e => e.runId === runId) : sliced;
	const start = runEvents.find(e => e.kind === 'run_start');
	const trigger = (start?.detail?.trigger as DroxCodebasePipelineTrigger | undefined) ?? undefined;

	const runDoneOk = runEvents.some(e => e.kind === 'run_done' && e.status === 'ok');
	const runFailed = runEvents.some(e => e.kind === 'error' || (e.kind === 'run_done' && e.status === 'error'));

	const stageState = (id: DroxCodebasePipelineStageId): IDroxCodebasePipelineStage['state'] => {
		const related = runEvents.filter(e => eventTouchesStage(e.kind, id));
		if (id === 'done') {
			if (runFailed) {
				return 'error';
			}
			return runDoneOk ? 'done' : (related.some(e => e.status === 'running') ? 'active' : 'pending');
		}
		if (!related.length) {
			// After a successful run, untouched stages (e.g. no embed work) → skipped
			return runDoneOk ? 'skipped' : 'pending';
		}
		const latest = related[related.length - 1]!;
		if (latest.status === 'error' || related.some(e => e.status === 'error')) {
			return 'error';
		}
		if (runDoneOk) {
			return latest.status === 'warn' && id === 'embed' ? 'done' : 'done';
		}
		if (latest.status === 'running') {
			return 'active';
		}
		// ok/warn for this stage: done if a later stage has started, else still active briefly
		const order: DroxCodebasePipelineStageId[] = ['scan', 'chunk', 'embed', 'write', 'done'];
		const idx = order.indexOf(id);
		const laterStarted = order.slice(idx + 1).some(s => runEvents.some(e => eventTouchesStage(e.kind, s)));
		return laterStarted ? 'done' : 'active';
	};

	const stages: IDroxCodebasePipelineStage[] = [
		{ id: 'scan', label: 'Scan', state: stageState('scan') },
		{ id: 'chunk', label: 'Chunk', state: stageState('chunk') },
		{ id: 'embed', label: 'Embed', state: stageState('embed') },
		{ id: 'write', label: 'Write', state: stageState('write') },
		{ id: 'done', label: 'Done', state: stageState('done') },
	];

	let progressPct = 0;
	const pctDetail = last?.detail?.progressPct;
	if (runDoneOk) {
		progressPct = 100;
	} else if (typeof pctDetail === 'number') {
		progressPct = Math.max(0, Math.min(100, pctDetail));
	} else {
		const doneCount = stages.filter(s => s.state === 'done' || s.state === 'skipped').length;
		const active = stages.some(s => s.state === 'active') ? 0.5 : 0;
		progressPct = Math.round(((doneCount + active) / stages.length) * 100);
	}

	return {
		runId,
		trigger,
		stages,
		events: sliced,
		progressPct,
		currentMessage: last?.message,
	};
}

function eventTouchesStage(kind: DroxCodebasePipelineStepKind, stage: DroxCodebasePipelineStageId): boolean {
	switch (stage) {
		case 'scan':
			return kind === 'scan';
		case 'chunk':
			return kind === 'chunk' || kind === 'skip';
		case 'embed':
			return kind === 'embed_load' || kind === 'embed_batch';
		case 'write':
			return kind === 'upsert' || kind === 'invalidate';
		case 'done':
			return kind === 'run_done' || kind === 'error';
		default:
			return false;
	}
}
