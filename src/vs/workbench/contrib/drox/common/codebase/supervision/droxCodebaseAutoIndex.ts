/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IDroxCodebaseIndexService } from '../droxCodebaseIndexService.js';
import { IDroxCodebaseCockpitSnapshot } from '../droxCodebaseTypes.js';

export type DroxCodebaseAutoIndexFire = () => void;
export type DroxCodebaseAutoIndexGetSnapshot = () => IDroxCodebaseCockpitSnapshot;
export type DroxCodebaseAutoIndexSetSnapshot = (s: IDroxCodebaseCockpitSnapshot) => void;

interface IDroxCodebaseAutoIndexJob {
	readonly root: URI;
	readonly reason: string;
}

/**
 * CB2b background `ensureIndexed` (hash-skip) without blocking the cockpit UI.
 *
 * Orchestration (Agents multi-discussion + IDE root switch):
 * - Lazy: only the root passed via {@link schedule} / current {@link getRoot}.
 * - Sequential: one `ensureIndexed` at a time.
 * - Coalesce: while in flight, later {@link schedule} calls keep only the **latest** root.
 * - Never fan-out across the whole discussion history list.
 */
export class DroxCodebaseAutoIndex {
	private _inFlight = false;
	private _pending: IDroxCodebaseAutoIndexJob | undefined;

	constructor(
		private readonly indexService: IDroxCodebaseIndexService,
		private readonly logService: ILogService,
		private readonly getRoot: () => URI | undefined,
		private readonly getSnapshot: DroxCodebaseAutoIndexGetSnapshot,
		private readonly setSnapshot: DroxCodebaseAutoIndexSetSnapshot,
		private readonly fire: DroxCodebaseAutoIndexFire,
		private readonly refresh: () => Promise<void>,
	) { }

	get inFlight(): boolean {
		return this._inFlight;
	}

	/** Test / diagnostics — last coalesced job waiting after the current run. */
	get pendingRootFsPath(): string | undefined {
		return this._pending?.root.fsPath;
	}

	schedule(reason: string): void {
		const root = this.getRoot();
		if (!root) {
			return;
		}
		const snapshot = this.getSnapshot();
		// Pause is per active root — never block indexing of a newly opened folder
		// because a previous root left the snapshot in `paused`.
		if (snapshot.state === 'paused' && snapshot.rootFsPath === root.fsPath) {
			return;
		}
		this._pending = { root, reason };
		if (!this._inFlight) {
			void this._runLoop();
		}
	}

	private async _runLoop(): Promise<void> {
		if (this._inFlight) {
			return;
		}
		this._inFlight = true;
		try {
			while (this._pending) {
				const job = this._pending;
				this._pending = undefined;
				await this._runJob(job);
			}
		} finally {
			this._inFlight = false;
			// A schedule() during the final job's finally window may have queued work
			// after the while exited but before _inFlight cleared — pick it up.
			if (this._pending) {
				void this._runLoop();
			}
		}
	}

	private async _runJob(job: IDroxCodebaseAutoIndexJob): Promise<void> {
		const snapshot = this.getSnapshot();
		this.setSnapshot({
			...snapshot,
			state: snapshot.storage.chunks > 0 ? snapshot.state : 'indexing',
			pipeline: { ...snapshot.pipeline, phase: `auto:${job.reason}` },
		});
		this.fire();
		try {
			const current = this.getSnapshot();
			if (current.state !== 'indexing') {
				this.setSnapshot({
					...current,
					state: 'indexing',
					pipeline: { ...current.pipeline, phase: `auto:${job.reason}` },
				});
				this.fire();
			}
			await this.indexService.ensureIndexed(job.root);
			await this.refresh();
		} catch (err) {
			this.logService.warn(`[drox-codebase] auto-index (${job.reason}) failed: ${err}`);
			const current = this.getSnapshot();
			this.setSnapshot({
				...current,
				state: 'error',
				lastError: err instanceof Error ? err.message : String(err),
			});
			this.fire();
		}
	}
}
