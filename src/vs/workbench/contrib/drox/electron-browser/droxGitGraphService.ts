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
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
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

	async getGraphWindow(folder: URI, options?: { readonly maxCount?: number; readonly includeRemotes?: boolean }): Promise<IDroxGitGraphWindow | undefined> {
		const path = this._nativePath(folder);
		if (!path) {
			return undefined;
		}
		const root = await this._localGitService.getRepoRoot(path);
		if (!root) {
			return undefined;
		}
		const [currentBranch, commits, refs, status] = await Promise.all([
			this._localGitService.getCurrentBranch(root),
			this._localGitService.getCommitLog(root, { maxCount: options?.maxCount ?? 500, includeRemotes: options?.includeRemotes }),
			this._localGitService.getRefs(root, { includeRemotes: options?.includeRemotes }),
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
			status,
		};
	}

	async checkoutBranch(folder: URI, branchName: string): Promise<void> {
		const path = this._nativePath(folder);
		if (!path) {
			throw new Error('Checkout is only supported for local folders.');
		}
		const root = await this._localGitService.getRepoRoot(path);
		if (!root) {
			throw new Error('Not a git repository.');
		}
		await this._localGitService.checkout(generateUuid(), root, branchName);
		await this.refreshBranch(folder);
	}

	async openGitGraph(folder: URI): Promise<void> {
		await this._commandService.executeCommand(DROX_GIT_GRAPH_OPEN_COMMAND_ID, folder);
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
