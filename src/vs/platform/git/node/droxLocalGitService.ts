/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { IDroxLocalGitService, IGitPushOptions, ILocalGitChangedFile, ILocalGitCommit, ILocalGitCommitDetails, ILocalGitCreateBranchOptions, ILocalGitLogOptions, ILocalGitRef, ILocalGitStash, ILocalGitStashPushOptions, ILocalGitStatusSummary, LocalGitRefKind, LocalGitResetMode } from '../common/droxLocalGitService.js';
import { LocalGitService } from './localGitService.js';

const COMMIT_FIELD_SEP = '\x1f';
const COMMIT_RECORD_SEP = '\x1e';
const DEFAULT_LOG_COUNT = 500;

export class DroxLocalGitService extends LocalGitService implements IDroxLocalGitService {

	async hasUncommittedChanges(repoPath: string): Promise<boolean> {
		const output = (await this._exec(generateUuid(), ['status', '--porcelain'], repoPath)).trim();
		return output.length > 0;
	}

	async getCurrentBranch(repoPath: string): Promise<string | undefined> {
		try {
			const branch = (await this._exec(generateUuid(), ['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)).trim();
			return branch && branch !== 'HEAD' ? branch : undefined;
		} catch {
			return undefined;
		}
	}

	async hasUpstream(repoPath: string, branchName: string): Promise<boolean> {
		try {
			const upstream = (await this._exec(generateUuid(), ['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`], repoPath)).trim();
			return upstream.length > 0;
		} catch {
			return false;
		}
	}

	async commitAll(repoPath: string, message: string): Promise<void> {
		await this._exec(generateUuid(), ['add', '-A', '--', ':/'], repoPath);
		await this._exec(generateUuid(), ['commit', '--no-verify', '--no-gpg-sign', '-m', message], repoPath);
	}

	async push(repoPath: string, options?: IGitPushOptions): Promise<void> {
		const args = ['push'];
		if (options?.setUpstream) {
			args.push('--set-upstream');
		}
		await this._exec(generateUuid(), args, repoPath);
	}

	async isGitRepository(repoPath: string): Promise<boolean> {
		try {
			const result = (await this._exec(generateUuid(), ['rev-parse', '--is-inside-work-tree'], repoPath)).trim();
			return result === 'true';
		} catch {
			return false;
		}
	}

	async getRepoRoot(repoPath: string): Promise<string | undefined> {
		try {
			const root = (await this._exec(generateUuid(), ['rev-parse', '--show-toplevel'], repoPath)).trim();
			return root.length > 0 ? root : undefined;
		} catch {
			return undefined;
		}
	}

	async getCommitLog(repoPath: string, options?: ILocalGitLogOptions): Promise<readonly ILocalGitCommit[]> {
		const maxCount = options?.maxCount ?? DEFAULT_LOG_COUNT;
		const args = [
			'log',
			'--date-order',
			`--max-count=${maxCount}`,
			`--pretty=format:%H${COMMIT_FIELD_SEP}%P${COMMIT_FIELD_SEP}%an${COMMIT_FIELD_SEP}%ae${COMMIT_FIELD_SEP}%at${COMMIT_FIELD_SEP}%s${COMMIT_RECORD_SEP}`,
		];
		if (options?.refs?.length) {
			args.splice(1, 0, ...options.refs);
		} else if (options?.includeRemotes !== false) {
			args.splice(1, 0, '--all');
		}

		let stdout: string;
		try {
			stdout = await this._exec(generateUuid(), args, repoPath);
		} catch {
			return [];
		}

		const commits: ILocalGitCommit[] = [];
		for (const record of stdout.split(COMMIT_RECORD_SEP)) {
			const trimmed = record.replace(/^\r?\n/, '').trimEnd();
			if (!trimmed) {
				continue;
			}
			const parts = trimmed.split(COMMIT_FIELD_SEP);
			if (parts.length < 6) {
				continue;
			}
			const [hash, parentsRaw, authorName, authorEmail, authorDateRaw, subject] = parts;
			const authorDateSeconds = Number(authorDateRaw);
			commits.push({
				hash,
				parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
				authorName,
				authorEmail,
				authorDateSeconds: Number.isFinite(authorDateSeconds) ? authorDateSeconds : 0,
				subject,
			});
		}
		return commits;
	}

	async getRefs(repoPath: string, options?: { readonly includeRemotes?: boolean }): Promise<readonly ILocalGitRef[]> {
		const patterns = ['refs/heads', 'refs/tags'];
		if (options?.includeRemotes !== false) {
			patterns.push('refs/remotes');
		}

		let stdout: string;
		try {
			stdout = await this._exec(generateUuid(), [
				'for-each-ref',
				`--format=%(objectname)${COMMIT_FIELD_SEP}%(refname)${COMMIT_FIELD_SEP}%(refname:short)`,
				...patterns,
			], repoPath);
		} catch {
			return [];
		}

		const refs: ILocalGitRef[] = [];
		for (const line of stdout.split(/\r?\n/)) {
			if (!line.trim()) {
				continue;
			}
			const [hash, refname, shortName] = line.split(COMMIT_FIELD_SEP);
			if (!hash || !refname || !shortName) {
				continue;
			}
			const kind = this._refKind(refname);
			if (!kind) {
				continue;
			}
			refs.push({ hash, name: shortName, kind });
		}
		return refs;
	}

	async getStatusSummary(repoPath: string): Promise<ILocalGitStatusSummary> {
		try {
			const output = (await this._exec(generateUuid(), ['status', '--porcelain'], repoPath)).trim();
			if (!output) {
				return { uncommittedCount: 0 };
			}
			return { uncommittedCount: output.split(/\r?\n/).filter(Boolean).length };
		} catch {
			return { uncommittedCount: 0 };
		}
	}

	async getStashes(repoPath: string): Promise<readonly ILocalGitStash[]> {
		try {
			const stdout = await this._exec(generateUuid(), [
				'stash',
				'list',
				`--pretty=format:%gd${COMMIT_FIELD_SEP}%H${COMMIT_FIELD_SEP}%s${COMMIT_RECORD_SEP}`,
			], repoPath);
			const stashes: ILocalGitStash[] = [];
			for (const record of stdout.split(COMMIT_RECORD_SEP)) {
				const trimmed = record.replace(/^\r?\n/, '').trimEnd();
				if (!trimmed) {
					continue;
				}
				const [reflogSelector, hash, subject] = trimmed.split(COMMIT_FIELD_SEP);
				if (!reflogSelector || !hash) {
					continue;
				}
				stashes.push({ reflogSelector, hash, subject: subject ?? '' });
			}
			return stashes;
		} catch {
			return [];
		}
	}

	async getCommitDetails(repoPath: string, commitHash: string): Promise<ILocalGitCommitDetails | undefined> {
		try {
			const meta = await this._exec(generateUuid(), [
				'log',
				'-1',
				`--pretty=format:%H${COMMIT_FIELD_SEP}%P${COMMIT_FIELD_SEP}%an${COMMIT_FIELD_SEP}%ae${COMMIT_FIELD_SEP}%at${COMMIT_FIELD_SEP}%s${COMMIT_FIELD_SEP}%b`,
				commitHash,
			], repoPath);
			const parts = meta.split(COMMIT_FIELD_SEP);
			if (parts.length < 7) {
				return undefined;
			}
			const [hash, parentsRaw, authorName, authorEmail, authorDateRaw, subject, ...bodyParts] = parts;
			const body = bodyParts.join(COMMIT_FIELD_SEP);
			const authorDateSeconds = Number(authorDateRaw);

			const nameStatus = await this._exec(generateUuid(), [
				'diff-tree',
				'--no-commit-id',
				'--name-status',
				'-r',
				'-z',
				commitHash,
			], repoPath);

			return {
				hash,
				parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
				authorName,
				authorEmail,
				authorDateSeconds: Number.isFinite(authorDateSeconds) ? authorDateSeconds : 0,
				subject,
				body,
				files: this._parseNameStatusNullSeparated(nameStatus),
			};
		} catch {
			return undefined;
		}
	}

	async getFileAtRevision(repoPath: string, rev: string, relativePath: string): Promise<string | undefined> {
		const normalized = relativePath.replace(/\\/g, '/');
		try {
			return await this._exec(generateUuid(), ['show', `${rev}:${normalized}`], repoPath);
		} catch {
			return undefined;
		}
	}

	async getChangedFilesBetween(repoPath: string, baseRev: string, headRev: string): Promise<readonly ILocalGitChangedFile[]> {
		try {
			const nameStatus = await this._exec(generateUuid(), [
				'diff',
				'--name-status',
				'-z',
				baseRev,
				headRev,
			], repoPath);
			return this._parseNameStatusNullSeparated(nameStatus);
		} catch {
			return [];
		}
	}

	async createBranch(repoPath: string, name: string, options?: ILocalGitCreateBranchOptions): Promise<void> {
		const args = options?.checkout ? ['checkout', '-b', name] : ['branch', name];
		if (options?.startPoint) {
			args.push(options.startPoint);
		}
		await this._exec(generateUuid(), args, repoPath);
	}

	async deleteBranch(repoPath: string, name: string, force?: boolean): Promise<void> {
		await this._exec(generateUuid(), ['branch', force ? '-D' : '-d', name], repoPath);
	}

	async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
		await this._exec(generateUuid(), ['branch', '-m', oldName, newName], repoPath);
	}

	async createTag(repoPath: string, name: string, commitHash: string, message?: string): Promise<void> {
		const args = message
			? ['tag', '-a', name, '-m', message, commitHash]
			: ['tag', name, commitHash];
		await this._exec(generateUuid(), args, repoPath);
	}

	async deleteTag(repoPath: string, name: string): Promise<void> {
		await this._exec(generateUuid(), ['tag', '-d', name], repoPath);
	}

	async merge(repoPath: string, ref: string): Promise<void> {
		await this._exec(generateUuid(), ['merge', '--no-edit', ref], repoPath);
	}

	async rebase(repoPath: string, upstream: string): Promise<void> {
		await this._exec(generateUuid(), ['rebase', upstream], repoPath);
	}

	async reset(repoPath: string, commitHash: string, mode: LocalGitResetMode): Promise<void> {
		const flag = mode === 'soft' ? '--soft' : mode === 'hard' ? '--hard' : '--mixed';
		await this._exec(generateUuid(), ['reset', flag, commitHash], repoPath);
	}

	async cherryPick(repoPath: string, commitHash: string): Promise<void> {
		await this._exec(generateUuid(), ['cherry-pick', commitHash], repoPath);
	}

	async revertCommit(repoPath: string, commitHash: string): Promise<void> {
		await this._exec(generateUuid(), ['revert', '--no-edit', commitHash], repoPath);
	}

	async pushRef(repoPath: string, remote: string, refSpec: string, options?: { readonly setUpstream?: boolean; readonly forceWithLease?: boolean }): Promise<void> {
		const args = ['push'];
		if (options?.setUpstream) {
			args.push('--set-upstream');
		}
		if (options?.forceWithLease) {
			args.push('--force-with-lease');
		}
		args.push(remote, refSpec);
		await this._exec(generateUuid(), args, repoPath);
	}

	async deleteRemoteBranch(repoPath: string, remoteAndBranch: string): Promise<void> {
		const slash = remoteAndBranch.indexOf('/');
		if (slash < 0) {
			throw new Error(`Invalid remote branch: ${remoteAndBranch}`);
		}
		const remote = remoteAndBranch.slice(0, slash);
		const branch = remoteAndBranch.slice(slash + 1);
		await this._exec(generateUuid(), ['push', remote, '--delete', branch], repoPath);
	}

	async stashPush(repoPath: string, options?: ILocalGitStashPushOptions): Promise<void> {
		const args = ['stash', 'push'];
		if (options?.includeUntracked) {
			args.push('-u');
		}
		if (options?.message) {
			args.push('-m', options.message);
		}
		await this._exec(generateUuid(), args, repoPath);
	}

	async stashApply(repoPath: string, selector: string): Promise<void> {
		await this._exec(generateUuid(), ['stash', 'apply', selector], repoPath);
	}

	async stashPop(repoPath: string, selector: string): Promise<void> {
		await this._exec(generateUuid(), ['stash', 'pop', selector], repoPath);
	}

	async stashDrop(repoPath: string, selector: string): Promise<void> {
		await this._exec(generateUuid(), ['stash', 'drop', selector], repoPath);
	}

	async resetUncommitted(repoPath: string, mode: 'mixed' | 'hard'): Promise<void> {
		await this._exec(generateUuid(), ['reset', mode === 'hard' ? '--hard' : '--mixed', 'HEAD'], repoPath);
	}

	async cleanUntracked(repoPath: string): Promise<void> {
		await this._exec(generateUuid(), ['clean', '-fd'], repoPath);
	}

	private _parseNameStatusNullSeparated(raw: string): ILocalGitChangedFile[] {
		const files: ILocalGitChangedFile[] = [];
		const parts = raw.split('\0').filter(Boolean);
		for (let i = 0; i < parts.length;) {
			const statusToken = parts[i++];
			if (!statusToken) {
				break;
			}
			const status = statusToken[0] ?? '?';
			if ((status === 'R' || status === 'C') && i + 1 < parts.length) {
				const oldPath = parts[i++];
				const path = parts[i++];
				files.push({ status, path, oldPath });
				continue;
			}
			const path = parts[i++];
			if (path) {
				files.push({ status, path });
			}
		}
		return files;
	}

	private _refKind(refname: string): LocalGitRefKind | undefined {
		if (refname.startsWith('refs/heads/')) {
			return 'head';
		}
		if (refname.startsWith('refs/remotes/')) {
			return 'remote';
		}
		if (refname.startsWith('refs/tags/')) {
			return 'tag';
		}
		return undefined;
	}
}
