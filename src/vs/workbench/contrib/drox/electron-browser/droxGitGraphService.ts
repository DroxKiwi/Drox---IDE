/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILocalGitChangedFile, ILocalGitCommitDetails, ILocalGitCreateBranchOptions, ILocalGitService, ILocalGitStashPushOptions, LocalGitResetMode } from '../../../../platform/git/common/localGitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { DROX_GIT_GRAPH_OPEN_COMMAND_ID, IDroxGitGraphService, IDroxGitGraphWindow } from '../common/droxGitGraphService.js';

interface IRepoEntry {
	readonly key: string;
	readonly folder: URI;
	readonly currentBranch: ISettableObservable<string | undefined>;
	readonly isGitRepo: ISettableObservable<boolean>;
	readonly store: DisposableStore;
	readonly refreshScheduler: RunOnceScheduler;
	readonly headWatch: MutableDisposable<DisposableStore>;
	repoRootFsPath: string | undefined;
}

export class DroxGitGraphService extends Disposable implements IDroxGitGraphService {
	declare readonly _serviceBrand: undefined;

	private readonly _repos = new Map<string, IRepoEntry>();

	constructor(
		@ILocalGitService private readonly _localGitService: ILocalGitService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
	}

	override dispose(): void {
		for (const entry of this._repos.values()) {
			entry.store.dispose();
		}
		this._repos.clear();
		super.dispose();
	}

	currentBranch(folder: URI): IObservable<string | undefined> {
		return this._ensureRepo(folder).currentBranch;
	}

	isGitRepo(folder: URI): IObservable<boolean> {
		return this._ensureRepo(folder).isGitRepo;
	}

	async refreshBranch(folder: URI): Promise<void> {
		await this._refreshRepo(this._ensureRepo(folder));
	}

	async getGraphWindow(folder: URI, options?: { readonly maxCount?: number; readonly includeRemotes?: boolean; readonly refs?: readonly string[] }): Promise<IDroxGitGraphWindow | undefined> {
		const root = await this._resolveRoot(folder);
		if (!root) {
			return undefined;
		}
		const [currentBranch, commits, refs, stashes, status] = await Promise.all([
			this._localGitService.getCurrentBranch(root),
			this._localGitService.getCommitLog(root, {
				maxCount: options?.maxCount ?? 500,
				includeRemotes: options?.includeRemotes,
				refs: options?.refs,
			}),
			this._localGitService.getRefs(root, { includeRemotes: options?.includeRemotes }),
			this._localGitService.getStashes(root),
			this._localGitService.getStatusSummary(root),
		]);
		const entry = this._ensureRepo(folder);
		entry.currentBranch.set(currentBranch, undefined);
		entry.isGitRepo.set(true, undefined);
		if (entry.repoRootFsPath !== root) {
			entry.repoRootFsPath = root;
			this._armHeadWatcher(entry, root);
		}
		return {
			repoRoot: URI.file(root),
			currentBranch,
			commits,
			refs,
			stashes,
			status,
		};
	}

	async getCommitDetails(folder: URI, commitHash: string): Promise<ILocalGitCommitDetails | undefined> {
		const root = await this._resolveRoot(folder);
		if (!root) {
			return undefined;
		}
		return this._localGitService.getCommitDetails(root, commitHash);
	}

	async getFileAtRevision(folder: URI, rev: string, relativePath: string): Promise<string | undefined> {
		const root = await this._resolveRoot(folder);
		if (!root) {
			return undefined;
		}
		return this._localGitService.getFileAtRevision(root, rev, relativePath);
	}

	async getChangedFilesBetween(folder: URI, baseRev: string, headRev: string): Promise<readonly ILocalGitChangedFile[]> {
		const root = await this._resolveRoot(folder);
		if (!root) {
			return [];
		}
		return this._localGitService.getChangedFilesBetween(root, baseRev, headRev);
	}

	async checkoutBranch(folder: URI, branchName: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.checkout(generateUuid(), root, branchName));
	}

	async checkoutDetached(folder: URI, treeish: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.checkout(generateUuid(), root, treeish, true));
	}

	async fetch(folder: URI): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.fetch(generateUuid(), root));
	}

	async createBranch(folder: URI, name: string, options?: ILocalGitCreateBranchOptions): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.createBranch(root, name, options));
	}

	async deleteBranch(folder: URI, name: string, force?: boolean): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.deleteBranch(root, name, force));
	}

	async renameBranch(folder: URI, oldName: string, newName: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.renameBranch(root, oldName, newName));
	}

	async createTag(folder: URI, name: string, commitHash: string, message?: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.createTag(root, name, commitHash, message));
	}

	async deleteTag(folder: URI, name: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.deleteTag(root, name));
	}

	async merge(folder: URI, ref: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.merge(root, ref));
	}

	async rebase(folder: URI, upstream: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.rebase(root, upstream));
	}

	async reset(folder: URI, commitHash: string, mode: LocalGitResetMode): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.reset(root, commitHash, mode));
	}

	async cherryPick(folder: URI, commitHash: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.cherryPick(root, commitHash));
	}

	async revertCommit(folder: URI, commitHash: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.revertCommit(root, commitHash));
	}

	async pushBranch(folder: URI, branchName: string, options?: { readonly setUpstream?: boolean }): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.pushRef(root, 'origin', branchName, options));
	}

	async pushTag(folder: URI, tagName: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.pushRef(root, 'origin', tagName));
	}

	async deleteRemoteBranch(folder: URI, remoteAndBranch: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.deleteRemoteBranch(root, remoteAndBranch));
	}

	async stashPush(folder: URI, options?: ILocalGitStashPushOptions): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.stashPush(root, options));
	}

	async stashApply(folder: URI, selector: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.stashApply(root, selector));
	}

	async stashPop(folder: URI, selector: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.stashPop(root, selector));
	}

	async stashDrop(folder: URI, selector: string): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.stashDrop(root, selector));
	}

	async resetUncommitted(folder: URI, mode: 'mixed' | 'hard'): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.resetUncommitted(root, mode));
	}

	async cleanUntracked(folder: URI): Promise<void> {
		await this._withRoot(folder, root => this._localGitService.cleanUntracked(root));
	}

	async openGitGraph(folder: URI): Promise<void> {
		await this._commandService.executeCommand(DROX_GIT_GRAPH_OPEN_COMMAND_ID, folder);
	}

	private async _resolveRoot(folder: URI): Promise<string | undefined> {
		const path = this._nativePath(folder);
		if (!path) {
			return undefined;
		}
		return this._localGitService.getRepoRoot(path);
	}

	private async _withRoot(folder: URI, fn: (root: string) => Promise<void>): Promise<void> {
		const root = await this._resolveRoot(folder);
		if (!root) {
			throw new Error('Not a git repository.');
		}
		await fn(root);
		await this.refreshBranch(folder);
	}

	private _ensureRepo(folder: URI): IRepoEntry {
		const key = folder.toString();
		const existing = this._repos.get(key);
		if (existing) {
			return existing;
		}

		const store = new DisposableStore();
		const headWatch = new MutableDisposable<DisposableStore>();
		store.add(headWatch);

		const entry: IRepoEntry = {
			key,
			folder,
			currentBranch: observableValue<string | undefined>(this, undefined),
			isGitRepo: observableValue<boolean>(this, false),
			store,
			refreshScheduler: new RunOnceScheduler(() => {
				void this._refreshRepo(entry);
			}, 200),
			headWatch,
			repoRootFsPath: undefined,
		};
		store.add(entry.refreshScheduler);
		store.add({ dispose: () => this._repos.delete(key) });
		this._repos.set(key, entry);
		this._register(store);

		void this._refreshRepo(entry);
		return entry;
	}

	private async _refreshRepo(entry: IRepoEntry): Promise<void> {
		const path = this._nativePath(entry.folder);
		if (!path) {
			entry.currentBranch.set(undefined, undefined);
			entry.isGitRepo.set(false, undefined);
			return;
		}

		try {
			const root = await this._localGitService.getRepoRoot(path);
			if (!root) {
				entry.repoRootFsPath = undefined;
				entry.headWatch.clear();
				entry.currentBranch.set(undefined, undefined);
				entry.isGitRepo.set(false, undefined);
				return;
			}

			const branch = await this._localGitService.getCurrentBranch(root);
			entry.currentBranch.set(branch, undefined);
			entry.isGitRepo.set(true, undefined);

			if (entry.repoRootFsPath !== root) {
				entry.repoRootFsPath = root;
				this._armHeadWatcher(entry, root);
			}
		} catch (err) {
			this._logService.trace(`[DroxGitGraphService] refresh failed for ${path}: ${err}`);
			entry.currentBranch.set(undefined, undefined);
			entry.isGitRepo.set(false, undefined);
		}
	}

	private _armHeadWatcher(entry: IRepoEntry, repoRootFsPath: string): void {
		const watchStore = new DisposableStore();
		entry.headWatch.value = watchStore;

		const gitDir = joinPath(URI.file(repoRootFsPath), '.git');
		const headUri = joinPath(gitDir, 'HEAD');
		try {
			watchStore.add(this._fileService.watch(gitDir));
			watchStore.add(this._fileService.onDidFilesChange(e => {
				if (e.affects(headUri) || e.affects(gitDir)) {
					entry.refreshScheduler.schedule();
				}
			}));
		} catch (err) {
			this._logService.trace(`[DroxGitGraphService] HEAD watch failed: ${err}`);
		}
	}

	private _nativePath(folder: URI): string | undefined {
		if (folder.scheme !== Schemas.file) {
			return undefined;
		}
		return folder.fsPath;
	}
}
