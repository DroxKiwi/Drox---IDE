/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildDroxCodebasePipelineView, createEmptyPipelineView, IDroxCodebaseCockpitSnapshot, IDroxCodebasePipelineEvent } from '../droxCodebaseTypes.js';

export const DROX_CODEBASE_PIPELINE_LOG_MAX = 200;

/**
 * Pipeline journal partitioned by workspace root so IDE / Agents cockpits
 * never mix logs across discussions / folders.
 */
export class DroxCodebasePipelineLog {
	private readonly _byRoot = new Map<string, IDroxCodebasePipelineEvent[]>();
	private _activeRootKey: string | undefined;

	setActiveRoot(rootFsPath: string | undefined): void {
		const key = rootFsPath?.trim();
		this._activeRootKey = key || undefined;
	}

	get activeRootKey(): string | undefined {
		return this._activeRootKey;
	}

	/** Events for the active root only. */
	get events(): readonly IDroxCodebasePipelineEvent[] {
		if (!this._activeRootKey) {
			return [];
		}
		return this._byRoot.get(this._activeRootKey) ?? [];
	}

	push(ev: IDroxCodebasePipelineEvent, max = DROX_CODEBASE_PIPELINE_LOG_MAX): void {
		const key = (ev.rootFsPath ?? this._activeRootKey ?? '').trim();
		if (!key) {
			return;
		}
		const tagged: IDroxCodebasePipelineEvent = ev.rootFsPath === key
			? ev
			: { ...ev, rootFsPath: key };
		const list = this._byRoot.get(key) ?? [];
		list.push(tagged);
		while (list.length > max) {
			list.shift();
		}
		this._byRoot.set(key, list);
	}

	/** Clears the active root's journal (cockpit "Clear log"). */
	clear(): void {
		if (!this._activeRootKey) {
			return;
		}
		this._byRoot.delete(this._activeRootKey);
	}

	buildView() {
		const events = this.events;
		return events.length
			? buildDroxCodebasePipelineView(events)
			: createEmptyPipelineView();
	}

	publishIntoSnapshot(
		snapshot: IDroxCodebaseCockpitSnapshot,
		opts: {
			readonly queueDepth: number;
			readonly autoIndexInFlight: boolean;
		},
	): IDroxCodebaseCockpitSnapshot {
		const events = this.events;
		const pipelineView = events.length
			? buildDroxCodebasePipelineView(events)
			: createEmptyPipelineView();
		const last = events[events.length - 1];
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
