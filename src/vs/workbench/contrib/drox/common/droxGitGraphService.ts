/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILocalGitCommit, ILocalGitRef, ILocalGitStatusSummary } from '../../../../platform/git/common/localGitService.js';

export const IDroxGitGraphService = createDecorator<IDroxGitGraphService>('droxGitGraphService');

export const DROX_GIT_GRAPH_OPEN_COMMAND_ID = 'drox.gitGraph.open';

export interface IDroxGitGraphWindow {
	readonly repoRoot: URI;
	readonly currentBranch: string | undefined;
	readonly commits: readonly ILocalGitCommit[];
	readonly refs: readonly ILocalGitRef[];
	readonly status: ILocalGitStatusSummary;
}

/**
 * Central branch / graph model for Drox Agents + IDE.
 * Fine-grained observables: badge listens to {@link currentBranch}; the graph view loads windows on demand.
 */
export interface IDroxGitGraphService {
	readonly _serviceBrand: undefined;

	/** Lightweight branch stream for a folder (undefined when not a git repo / unknown). */
	currentBranch(folder: URI): IObservable<string | undefined>;

	/** Whether the folder is (or contains) a git work tree — last known, refreshed async. */
	isGitRepo(folder: URI): IObservable<boolean>;

	/** Force refresh of branch / is-repo for a folder (and optional HEAD watcher arm). */
	refreshBranch(folder: URI): Promise<void>;

	/** Load a bounded commit/ref window for the graph UI. */
	getGraphWindow(folder: URI, options?: { readonly maxCount?: number; readonly includeRemotes?: boolean }): Promise<IDroxGitGraphWindow | undefined>;

	checkoutBranch(folder: URI, branchName: string): Promise<void>;

	openGitGraph(folder: URI): Promise<void>;
}
