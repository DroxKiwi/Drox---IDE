/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	ILocalGitChangedFile,
	ILocalGitCommit,
	ILocalGitCommitDetails,
	ILocalGitCreateBranchOptions,
	ILocalGitRef,
	ILocalGitStash,
	ILocalGitStashPushOptions,
	ILocalGitStatusSummary,
	LocalGitResetMode,
} from '../../../../platform/git/common/localGitService.js';

export const IDroxGitGraphService = createDecorator<IDroxGitGraphService>('droxGitGraphService');

export const DROX_GIT_GRAPH_OPEN_COMMAND_ID = 'drox.gitGraph.open';

export interface IDroxGitGraphWindow {
	readonly repoRoot: URI;
	readonly currentBranch: string | undefined;
	readonly commits: readonly ILocalGitCommit[];
	readonly refs: readonly ILocalGitRef[];
	readonly stashes: readonly ILocalGitStash[];
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
	getGraphWindow(folder: URI, options?: {
		readonly maxCount?: number;
		readonly includeRemotes?: boolean;
		readonly refs?: readonly string[];
	}): Promise<IDroxGitGraphWindow | undefined>;

	getCommitDetails(folder: URI, commitHash: string): Promise<ILocalGitCommitDetails | undefined>;
	getFileAtRevision(folder: URI, rev: string, relativePath: string): Promise<string | undefined>;
	getChangedFilesBetween(folder: URI, baseRev: string, headRev: string): Promise<readonly ILocalGitChangedFile[]>;

	checkoutBranch(folder: URI, branchName: string): Promise<void>;
	checkoutDetached(folder: URI, treeish: string): Promise<void>;
	fetch(folder: URI): Promise<void>;

	createBranch(folder: URI, name: string, options?: ILocalGitCreateBranchOptions): Promise<void>;
	deleteBranch(folder: URI, name: string, force?: boolean): Promise<void>;
	renameBranch(folder: URI, oldName: string, newName: string): Promise<void>;
	createTag(folder: URI, name: string, commitHash: string, message?: string): Promise<void>;
	deleteTag(folder: URI, name: string): Promise<void>;
	merge(folder: URI, ref: string): Promise<void>;
	rebase(folder: URI, upstream: string): Promise<void>;
	reset(folder: URI, commitHash: string, mode: LocalGitResetMode): Promise<void>;
	cherryPick(folder: URI, commitHash: string): Promise<void>;
	revertCommit(folder: URI, commitHash: string): Promise<void>;
	pushBranch(folder: URI, branchName: string, options?: { readonly setUpstream?: boolean }): Promise<void>;
	pushTag(folder: URI, tagName: string): Promise<void>;
	deleteRemoteBranch(folder: URI, remoteAndBranch: string): Promise<void>;

	stashPush(folder: URI, options?: ILocalGitStashPushOptions): Promise<void>;
	stashApply(folder: URI, selector: string): Promise<void>;
	stashPop(folder: URI, selector: string): Promise<void>;
	stashDrop(folder: URI, selector: string): Promise<void>;
	resetUncommitted(folder: URI, mode: 'mixed' | 'hard'): Promise<void>;
	cleanUntracked(folder: URI): Promise<void>;

	openGitGraph(folder: URI): Promise<void>;
}
