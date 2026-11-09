/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILocalGitService } from './localGitService.js';

export const IDroxLocalGitService = refineServiceDecorator<ILocalGitService, IDroxLocalGitService>(ILocalGitService);

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
	/** When set, log these refs instead of `--all` / HEAD. */
	readonly refs?: readonly string[];
}

export interface ILocalGitStatusSummary {
	readonly uncommittedCount: number;
}

export interface ILocalGitStash {
	readonly reflogSelector: string;
	readonly hash: string;
	readonly subject: string;
}

export type LocalGitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';

export interface ILocalGitChangedFile {
	readonly status: LocalGitFileStatus | string;
	readonly path: string;
	readonly oldPath?: string;
}

export interface ILocalGitCommitDetails {
	readonly hash: string;
	readonly parents: readonly string[];
	readonly authorName: string;
	readonly authorEmail: string;
	readonly authorDateSeconds: number;
	readonly subject: string;
	readonly body: string;
	readonly files: readonly ILocalGitChangedFile[];
}

export type LocalGitResetMode = 'soft' | 'mixed' | 'hard';

export interface ILocalGitCreateBranchOptions {
	readonly checkout?: boolean;
	readonly startPoint?: string;
}

export interface ILocalGitStashPushOptions {
	readonly message?: string;
	readonly includeUntracked?: boolean;
}

export interface IDroxLocalGitService extends ILocalGitService {

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
	getStashes(repoPath: string): Promise<readonly ILocalGitStash[]>;
	getCommitDetails(repoPath: string, commitHash: string): Promise<ILocalGitCommitDetails | undefined>;
	/** File contents at `rev:path` (UTF-8). `undefined` if missing (added/deleted / binary error). */
	getFileAtRevision(repoPath: string, rev: string, relativePath: string): Promise<string | undefined>;
	getChangedFilesBetween(repoPath: string, baseRev: string, headRev: string): Promise<readonly ILocalGitChangedFile[]>;

	createBranch(repoPath: string, name: string, options?: ILocalGitCreateBranchOptions): Promise<void>;
	deleteBranch(repoPath: string, name: string, force?: boolean): Promise<void>;
	renameBranch(repoPath: string, oldName: string, newName: string): Promise<void>;
	createTag(repoPath: string, name: string, commitHash: string, message?: string): Promise<void>;
	deleteTag(repoPath: string, name: string): Promise<void>;
	merge(repoPath: string, ref: string): Promise<void>;
	rebase(repoPath: string, upstream: string): Promise<void>;
	reset(repoPath: string, commitHash: string, mode: LocalGitResetMode): Promise<void>;
	cherryPick(repoPath: string, commitHash: string): Promise<void>;
	revertCommit(repoPath: string, commitHash: string): Promise<void>;
	pushRef(repoPath: string, remote: string, refSpec: string, options?: { readonly setUpstream?: boolean; readonly forceWithLease?: boolean }): Promise<void>;
	deleteRemoteBranch(repoPath: string, remoteAndBranch: string): Promise<void>;

	stashPush(repoPath: string, options?: ILocalGitStashPushOptions): Promise<void>;
	stashApply(repoPath: string, selector: string): Promise<void>;
	stashPop(repoPath: string, selector: string): Promise<void>;
	stashDrop(repoPath: string, selector: string): Promise<void>;
	resetUncommitted(repoPath: string, mode: 'mixed' | 'hard'): Promise<void>;
	cleanUntracked(repoPath: string): Promise<void>;
}
