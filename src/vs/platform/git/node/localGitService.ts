/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { CancellationError } from '../../../base/common/errors.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IGitPullOptions, IGitPushOptions, ILocalGitCommit, ILocalGitLogOptions, ILocalGitRef, ILocalGitService, ILocalGitStatusSummary, LocalGitRefKind } from '../common/localGitService.js';
import { ILogService } from '../../log/common/log.js';

const COMMIT_FIELD_SEP = '\x1f';
const COMMIT_RECORD_SEP = '\x1e';
const DEFAULT_LOG_COUNT = 500;
export class LocalGitService implements ILocalGitService {
	declare readonly _serviceBrand: undefined;

	private _runningProcesses = new Map<string, cp.ChildProcess>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _execFile: typeof cp.execFile = cp.execFile,
	) { }

	private _exec(operationId: string, args: string[], cwd?: string): Promise<string> {
		return new Promise((resolve, reject) => {
			this._logService.trace(`[LocalGitService] git ${args.join(' ')}${cwd ? ` (cwd: ${cwd})` : ''}`);
			const proc = this._execFile('git', args, { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
				if (!this._runningProcesses.delete(operationId)) {
					reject(new CancellationError());
					return;
				}
				if (err) {
					this._logService.error(`[LocalGitService] git ${args[0]} failed:`, err.message, stderr);
					reject(err);
					return;
				}
				resolve(stdout);
			});

			this._runningProcesses.set(operationId, proc);
		});
	}

	async clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string): Promise<void> {
		const args = ['clone'];
		if (ref) {
			args.push('--branch', ref);
		}
		args.push('--', cloneUrl, targetPath);
		await this._exec(operationId, args);
	}

	async pull(operationId: string, repoPath: string, options?: IGitPullOptions): Promise<boolean> {
		const before = (await this._exec(operationId, ['rev-parse', 'HEAD'], repoPath)).trim();

		try {
			await this._exec(operationId, ['pull', '--ff-only'], repoPath);
		} catch (err) {
			if (!this._isFastForwardPullFailure(err)) {
				throw err;
			}

			const error = err as { message?: string };
			this._logService.warn(`[LocalGitService] Fast-forward pull failed for ${repoPath}: ${error?.message ?? String(err)}. Retrying after fetch.`);
			await this._exec(operationId, ['fetch', '--prune'], repoPath);

			try {
				await this._exec(operationId, ['pull', '--ff-only'], repoPath);
			} catch (retryErr) {
				if (!this._isFastForwardPullFailure(retryErr)) {
					throw retryErr;
				}

				if (!options?.allowHardResetOnDivergence) {
					throw retryErr;
				}

				const upstream = await this._getSafeHardResetTarget(operationId, repoPath);
				if (!upstream) {
					throw retryErr;
				}

				this._logService.warn(`[LocalGitService] Pull retries exhausted for ${repoPath}. Performing hard reset to ${upstream}.`);
				await this._exec(operationId, ['reset', '--hard', upstream], repoPath);
			}
		}

		const after = (await this._exec(operationId, ['rev-parse', 'HEAD'], repoPath)).trim();
		return before !== after;
	}

	private _isFastForwardPullFailure(err: unknown): err is cp.ExecFileException & { stderr?: string } {
		const error = err as (cp.ExecFileException & { stderr?: string; message?: string }) | undefined;
		if (error?.code !== 128) {
			return false;
		}

		const details = `${error.stderr ?? ''}\n${error.message ?? ''}`;
		return /not possible to fast-forward|non-fast-forward/i.test(details);
	}

	private async _getSafeHardResetTarget(operationId: string, repoPath: string): Promise<string | undefined> {
		const status = (await this._exec(operationId, ['status', '--porcelain'], repoPath)).trim();
		if (status.length > 0) {
			return undefined;
		}

		let upstream: string;
		try {
			upstream = (await this._exec(operationId, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath)).trim();
		} catch {
			return undefined;
		}

		const behind = await this._revListCount(operationId, repoPath, 'HEAD', '@{u}');
		const ahead = await this._revListCount(operationId, repoPath, '@{u}', 'HEAD');
		if (ahead === undefined || behind === undefined || ahead <= 0 || behind <= 0) {
			return undefined;
		}

		return upstream;
	}

	private async _revListCount(operationId: string, repoPath: string, fromRef: string, toRef: string): Promise<number | undefined> {
		const result = await this._exec(operationId, ['rev-list', '--count', `${fromRef}..${toRef}`], repoPath);
		const parsed = Number(result.trim());
		if (!Number.isFinite(parsed)) {
			this._logService.warn(`[LocalGitService] Failed to parse rev-list count for ${fromRef}..${toRef} in ${repoPath}: ${result}`);
			return undefined;
		}

		return parsed;
	}

	async checkout(operationId: string, repoPath: string, treeish: string, detached?: boolean): Promise<void> {
		const args = detached
			? ['checkout', '--detach', treeish]
			: ['checkout', treeish];
		await this._exec(operationId, args, repoPath);
	}

	async revParse(repoPath: string, ref: string): Promise<string> {
		return (await this._exec(generateUuid(), ['rev-parse', ref], repoPath)).trim();
	}

	async fetch(operationId: string, repoPath: string): Promise<void> {
		await this._exec(operationId, ['fetch'], repoPath);
	}

	async revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number> {
		const result = await this._exec(generateUuid(), ['rev-list', '--count', `${fromRef}..${toRef}`], repoPath);
		return Number(result.trim()) || 0;
	}

	async cancel(operationId: string): Promise<void> {
		const proc = this._runningProcesses.get(operationId);
		if (proc) {
			this._runningProcesses.delete(operationId);
			proc.kill();
		}
	}

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
		if (options?.includeRemotes !== false) {
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
