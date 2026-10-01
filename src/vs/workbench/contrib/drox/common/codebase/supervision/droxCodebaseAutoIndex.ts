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

/**
 * CB2b background ensureIndexed (hash-skip) without blocking the cockpit UI.
 */
export class DroxCodebaseAutoIndex {
	private _inFlight = false;

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

	schedule(reason: string): void {
		const root = this.getRoot();
		const snapshot = this.getSnapshot();
		if (!root || this._inFlight || snapshot.state === 'paused') {
			return;
		}
		this._inFlight = true;
		this.setSnapshot({
			...snapshot,
			state: snapshot.storage.chunks > 0 ? snapshot.state : 'indexing',
			pipeline: { ...snapshot.pipeline, phase: `auto:${reason}` },
		});
		this.fire();
		void (async () => {
			try {
				const current = this.getSnapshot();
				if (current.state !== 'indexing') {
					this.setSnapshot({
						...current,
						state: 'indexing',
						pipeline: { ...current.pipeline, phase: `auto:${reason}` },
					});
					this.fire();
				}
				await this.indexService.ensureIndexed(root);
				await this.refresh();
			} catch (err) {
				this.logService.warn(`[drox-codebase] auto-index (${reason}) failed: ${err}`);
				const current = this.getSnapshot();
				this.setSnapshot({
					...current,
					state: 'error',
					lastError: err instanceof Error ? err.message : String(err),
				});
				this.fire();
			} finally {
				this._inFlight = false;
			}
		})();
	}
}
