/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDroxCodebaseIndexService, IDroxCodebaseSearchOptions } from './droxCodebaseIndexService.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';

/**
 * CB1 placeholder — no disk index yet. Search returns empty; ensureIndexed is a no-op.
 * Real chunker + store replace this implementation in follow-up CB1 work.
 */
export class DroxCodebaseIndexService extends Disposable implements IDroxCodebaseIndexService {

	declare readonly _serviceBrand: undefined;

	private readonly _paused = new Set<string>();

	async ensureIndexed(_workspaceRoot: URI): Promise<void> {
		// CB1: scan + lexical upsert — not yet implemented.
	}

	async search(_workspaceRoot: URI, _query: string, _opts?: IDroxCodebaseSearchOptions): Promise<readonly IDroxCodebaseHit[]> {
		return [];
	}

	async invalidate(_workspaceRoot: URI, _paths: readonly URI[]): Promise<void> {
		// no-op stub
	}

	async purge(_workspaceRoot: URI): Promise<void> {
		// CB1: delete .drox/codebase-index/
	}

	pause(workspaceRoot: URI): void {
		this._paused.add(workspaceRoot.fsPath);
	}

	resume(workspaceRoot: URI): void {
		this._paused.delete(workspaceRoot.fsPath);
	}
}
