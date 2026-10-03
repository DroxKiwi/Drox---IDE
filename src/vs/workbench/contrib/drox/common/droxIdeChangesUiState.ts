/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISessionFileChange } from '../../../../sessions/services/sessions/common/session.js';
import { countDroxSessionFileChangeStats } from './droxSessionGitChanges.js';

export interface IDroxIdeChangesUiStats {
	readonly files: number;
	readonly added: number;
	readonly removed: number;
}

export const IDroxIdeChangesUiState = createDecorator<IDroxIdeChangesUiState>('droxIdeChangesUiState');

export interface IDroxIdeChangesUiState {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly onDidRequestRefresh: Event<void>;
	readonly sessionResource: URI | undefined;
	readonly mergedFiles: readonly ISessionFileChange[] | undefined;
	readonly stats: IDroxIdeChangesUiStats;
	readonly hasUncommittedChanges: boolean;
	/** Current HEAD label(s), e.g. `0.0.0` or `repo: main`. */
	readonly branchLabels: readonly string[];
	setSnapshot(
		sessionResource: URI | undefined,
		mergedFiles: readonly ISessionFileChange[] | undefined,
		branchLabels?: readonly string[],
	): void;
	requestRefresh(): void;
}

export class DroxIdeChangesUiState extends Disposable implements IDroxIdeChangesUiState {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidRequestRefresh = this._register(new Emitter<void>());
	readonly onDidRequestRefresh = this._onDidRequestRefresh.event;

	private _sessionResource: URI | undefined;
	private _mergedFiles: readonly ISessionFileChange[] | undefined;
	private _stats: IDroxIdeChangesUiStats = { files: 0, added: 0, removed: 0 };
	private _branchLabels: readonly string[] = [];

	get sessionResource(): URI | undefined {
		return this._sessionResource;
	}

	get mergedFiles(): readonly ISessionFileChange[] | undefined {
		return this._mergedFiles;
	}

	get stats(): IDroxIdeChangesUiStats {
		return this._stats;
	}

	get hasUncommittedChanges(): boolean {
		return this._stats.files > 0;
	}

	get branchLabels(): readonly string[] {
		return this._branchLabels;
	}

	setSnapshot(
		sessionResource: URI | undefined,
		mergedFiles: readonly ISessionFileChange[] | undefined,
		branchLabels: readonly string[] = [],
	): void {
		const nextStats = mergedFiles
			? countDroxSessionFileChangeStats(mergedFiles)
			: { files: 0, added: 0, removed: 0 };
		const nextBranches = [...branchLabels];
		const sameSession = (this._sessionResource?.toString() ?? '') === (sessionResource?.toString() ?? '');
		const sameFiles = (this._mergedFiles?.length ?? -1) === (mergedFiles?.length ?? -1)
			&& this._stats.files === nextStats.files
			&& this._stats.added === nextStats.added
			&& this._stats.removed === nextStats.removed;
		const sameBranches = this._branchLabels.length === nextBranches.length
			&& this._branchLabels.every((b, i) => b === nextBranches[i]);
		this._sessionResource = sessionResource;
		this._mergedFiles = mergedFiles;
		this._stats = nextStats;
		this._branchLabels = nextBranches;
		if (!sameSession || !sameFiles || !sameBranches) {
			this._onDidChange.fire();
		}
	}

	requestRefresh(): void {
		this._onDidRequestRefresh.fire();
	}
}
