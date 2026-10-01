/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	DroxCodebasePipelineStageId,
	DroxCodebasePipelineStepKind,
	DroxCodebasePipelineTrigger,
	IDroxCodebasePipelineEvent,
	IDroxCodebasePipelineStage,
	IDroxCodebasePipelineView,
} from './droxCodebaseTypes.js';

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
			return runDoneOk ? 'skipped' : 'pending';
		}
		const latest = related[related.length - 1]!;
		if (latest.status === 'error' || related.some(e => e.status === 'error')) {
			return 'error';
		}
		if (runDoneOk) {
			return 'done';
		}
		if (latest.status === 'running') {
			return 'active';
		}
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
