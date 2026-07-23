/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ILocalGitService = createDecorator<ILocalGitService>('localGitService');

export interface IGitPullOptions {
	readonly allowHardResetOnDivergence?: boolean;
}

export interface IGitPushOptions {
	readonly setUpstream?: boolean;
}

export type LocalGitRefKind = 'head' | 'remote' | 'tag';

export interface ILocalGitCommit {
	readonly hash: string;
	readonly parents: readonly string[];
	readonly authorName: string;
	readonly authorEmail: string;
	readonly authorDateSeconds: number;
	readonly subject: string;
}

export interface ILocalGitRef {
	readonly hash: string;
	readonly name: string;
	readonly kind: LocalGitRefKind;
}

export interface ILocalGitLogOptions {
	readonly maxCount?: number;
	readonly includeRemotes?: boolean;
}

export interface ILocalGitStatusSummary {
	readonly uncommittedCount: number;
}

/**
 * Low-level service for executing git commands on the local machine.
 * Used in the shared process where Node.js APIs are available.
 * All path arguments are native file-system paths.
 */
export interface ILocalGitService {
	readonly _serviceBrand: undefined;

	clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string): Promise<void>;
	pull(operationId: string, repoPath: string, options?: IGitPullOptions): Promise<boolean>;
	checkout(operationId: string, repoPath: string, treeish: string, detached?: boolean): Promise<void>;
	revParse(repoPath: string, ref: string): Promise<string>;
	fetch(operationId: string, repoPath: string): Promise<void>;
	revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number>;
	cancel(operationId: string): Promise<void>;

	hasUncommittedChanges(repoPath: string): Promise<boolean>;
	getCurrentBranch(repoPath: string): Promise<string | undefined>;
	hasUpstream(repoPath: string, branchName: string): Promise<boolean>;
	commitAll(repoPath: string, message: string): Promise<void>;
	push(repoPath: string, options?: IGitPushOptions): Promise<void>;

	/** Returns whether `repoPath` is inside a git work tree. */
	isGitRepository(repoPath: string): Promise<boolean>;
	/** Absolute path to the work-tree root, or `undefined` if not a repo. */
	getRepoRoot(repoPath: string): Promise<string | undefined>;
	getCommitLog(repoPath: string, options?: ILocalGitLogOptions): Promise<readonly ILocalGitCommit[]>;
	getRefs(repoPath: string, options?: { readonly includeRemotes?: boolean }): Promise<readonly ILocalGitRef[]>;
	getStatusSummary(repoPath: string): Promise<ILocalGitStatusSummary>;
}
