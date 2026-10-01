/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildDroxCodebasePipelineView, createEmptyPipelineView, IDroxCodebaseCockpitSnapshot, IDroxCodebasePipelineEvent } from '../droxCodebaseTypes.js';

export const DROX_CODEBASE_PIPELINE_LOG_MAX = 200;

export class DroxCodebasePipelineLog {
	private readonly _events: IDroxCodebasePipelineEvent[] = [];

	get events(): readonly IDroxCodebasePipelineEvent[] {
		return this._events;
	}

	push(ev: IDroxCodebasePipelineEvent, max = DROX_CODEBASE_PIPELINE_LOG_MAX): void {
		this._events.push(ev);
		while (this._events.length > max) {
			this._events.shift();
		}
	}

	clear(): void {
		this._events.length = 0;
	}

	buildView() {
		return this._events.length
			? buildDroxCodebasePipelineView(this._events)
			: createEmptyPipelineView();
	}

	publishIntoSnapshot(
		snapshot: IDroxCodebaseCockpitSnapshot,
		opts: {
			readonly queueDepth: number;
			readonly autoIndexInFlight: boolean;
		},
	): IDroxCodebaseCockpitSnapshot {
		const pipelineView = this.buildView();
		const last = this._events[this._events.length - 1];
		const indexing = !!(last && (
			(last.kind !== 'run_done' && last.kind !== 'error' && last.status === 'running')
			|| (last.kind !== 'run_done' && last.kind !== 'error' && opts.autoIndexInFlight)
		));
		return {
			...snapshot,
			state: indexing && snapshot.state !== 'paused' && snapshot.state !== 'error'
				? 'indexing'
				: (snapshot.state === 'indexing' && (last?.kind === 'run_done' || last?.kind === 'error')
					? (last.kind === 'error' ? 'error' : 'idle')
					: snapshot.state),
			pipeline: {
				queueDepth: opts.queueDepth,
				chunksPerSec: snapshot.pipeline.chunksPerSec,
				phase: pipelineView.currentMessage,
				currentPath: last?.path,
				progressPct: pipelineView.progressPct,
				runId: pipelineView.runId,
				trigger: pipelineView.trigger,
			},
			pipelineView,
		};
	}
}
