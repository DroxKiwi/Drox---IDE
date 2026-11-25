/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { LocalGitService } from '../../node/localGitService.js';

interface IExecFileExpectation {
	args: string[];
	stdout?: string;
	stderr?: string;
	error?: cp.ExecFileException;
}

function createExecFile(expectations: IExecFileExpectation[]): typeof cp.execFile {
	return ((command: string, args: readonly string[], _options: cp.ExecFileOptions, callback: (error: cp.ExecFileException | null, stdout: string, stderr: string) => void) => {
		assert.strictEqual(command, 'git');

		const expectation = expectations.shift();
		assert.ok(expectation, `Unexpected git call: ${(args as string[]).join(' ')}`);
		assert.deepStrictEqual(args, expectation.args);

		queueMicrotask(() => callback(expectation.error ?? null, expectation.stdout ?? '', expectation.stderr ?? ''));

		return {} as cp.ChildProcess;
	}) as typeof cp.execFile;
}

function createDivergedPullError(): cp.ExecFileException {
	const error = new Error('fatal: Not possible to fast-forward, aborting.') as cp.ExecFileException & { stderr: string };
	error.code = 128;
	error.stderr = 'fatal: Not possible to fast-forward, aborting.';
	return error;
}

function createPullError(message: string, stderr: string, code = 128): cp.ExecFileException {
	const error = new Error(message) as cp.ExecFileException & { stderr: string };
	error.code = code;
	error.stderr = stderr;
	return error;
}

suite('LocalGitService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	void store;

	test('pull runs ff-only for normal updates', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		const changed = await service.pull('test-op', 'C:\\repo');

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull recovers from diverged history by resetting to upstream', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['status', '--porcelain'], stdout: '' },
			{ args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], stdout: 'origin/main\n' },
			{ args: ['rev-list', '--count', 'HEAD..@{u}'], stdout: '2\n' },
			{ args: ['rev-list', '--count', '@{u}..HEAD'], stdout: '1\n' },
			{ args: ['reset', '--hard', 'origin/main'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		const changed = await service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true });

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rejects hard reset recovery when working tree is dirty', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['status', '--porcelain'], stdout: ' M package.json\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows non-fast-forward errors without retrying', async () => {
		const pullError = createPullError('fatal: Failed to pull', 'fatal: Authentication failed');
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: pullError, stderr: 'fatal: Authentication failed' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Failed to pull/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows retry failures that are not fast-forward related', async () => {
		const retryError = createPullError('fatal: Failed to pull', 'fatal: Authentication failed');
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: retryError, stderr: 'fatal: Authentication failed' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Failed to pull/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull succeeds on second ff-only attempt after fetch', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		const changed = await service.pull('test-op', 'C:\\repo');

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull without hard-reset option does not attempt destructive recovery', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo'),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows when upstream cannot be resolved during recovery', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['status', '--porcelain'], stdout: '' },
			{ args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], error: new Error('no upstream configured') as cp.ExecFileException },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('isGitRepository returns true for work trees', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', '--is-inside-work-tree'], stdout: 'true\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		assert.strictEqual(await service.isGitRepository('C:\\repo'), true);
		assert.strictEqual(expectations.length, 0);
	});

	test('getCommitLog parses structured records', async () => {
		const stdout = [
			`aaaa${'\x1f'}bbbb${'\x1f'}Ada${'\x1f'}ada@example.com${'\x1f'}1700000000${'\x1f'}feat: hello${'\x1e'}`,
			`bbbb${'\x1f'}${'\x1f'}Ada${'\x1f'}ada@example.com${'\x1f'}1699999999${'\x1f'}init${'\x1e'}`,
		].join('');
		const expectations: IExecFileExpectation[] = [
			{
				args: [
					'log',
					'--all',
					'--date-order',
					'--max-count=2',
					`--pretty=format:%H${'\x1f'}%P${'\x1f'}%an${'\x1f'}%ae${'\x1f'}%at${'\x1f'}%s${'\x1e'}`,
				],
				stdout,
			},
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const commits = await service.getCommitLog('C:\\repo', { maxCount: 2 });
		assert.strictEqual(commits.length, 2);
		assert.strictEqual(commits[0].hash, 'aaaa');
		assert.deepStrictEqual(commits[0].parents, ['bbbb']);
		assert.strictEqual(commits[0].subject, 'feat: hello');
		assert.deepStrictEqual(commits[1].parents, []);
		assert.strictEqual(expectations.length, 0);
	});

	test('getRefs classifies heads remotes and tags', async () => {
		const expectations: IExecFileExpectation[] = [
			{
				args: [
					'for-each-ref',
					`--format=%(objectname)${'\x1f'}%(refname)${'\x1f'}%(refname:short)`,
					'refs/heads',
					'refs/tags',
					'refs/remotes',
				],
				stdout: [
					`aaaa${'\x1f'}refs/heads/main${'\x1f'}main`,
					`bbbb${'\x1f'}refs/remotes/origin/main${'\x1f'}origin/main`,
					`cccc${'\x1f'}refs/tags/v1${'\x1f'}v1`,
					'',
				].join('\n'),
			},
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const refs = await service.getRefs('C:\\repo');
		assert.deepStrictEqual(refs, [
			{ hash: 'aaaa', name: 'main', kind: 'head' },
			{ hash: 'bbbb', name: 'origin/main', kind: 'remote' },
			{ hash: 'cccc', name: 'v1', kind: 'tag' },
		]);
		assert.strictEqual(expectations.length, 0);
	});

	test('getStashes parses stash list records', async () => {
		const expectations: IExecFileExpectation[] = [
			{
				args: [
					'stash',
					'list',
					`--pretty=format:%gd${'\x1f'}%H${'\x1f'}%s${'\x1e'}`,
				],
				stdout: `stash@{0}${'\x1f'}deadbeef${'\x1f'}WIP on main: tip${'\x1e'}`,
			},
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const stashes = await service.getStashes('C:\\repo');
		assert.deepStrictEqual(stashes, [
			{ reflogSelector: 'stash@{0}', hash: 'deadbeef', subject: 'WIP on main: tip' },
		]);
		assert.strictEqual(expectations.length, 0);
	});

	test('createBranch checkouts with start point when requested', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['checkout', '-b', 'feature', 'abc123'] },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		await service.createBranch('C:\\repo', 'feature', { checkout: true, startPoint: 'abc123' });
		assert.strictEqual(expectations.length, 0);
	});

	test('getFileAtRevision returns file blob contents', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['show', 'abc:src/a.ts'], stdout: 'console.log(1);\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const content = await service.getFileAtRevision('C:\\repo', 'abc', 'src\\a.ts');
		assert.strictEqual(content, 'console.log(1);\n');
		assert.strictEqual(expectations.length, 0);
	});

	test('getChangedFilesBetween parses name-status', async () => {
		const expectations: IExecFileExpectation[] = [
			{
				args: ['diff', '--name-status', '-z', 'aaa', 'bbb'],
				stdout: `M\0src/a.ts\0A\0src/b.ts\0`,
			},
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const files = await service.getChangedFilesBetween('C:\\repo', 'aaa', 'bbb');
		assert.deepStrictEqual(files, [
			{ status: 'M', path: 'src/a.ts' },
			{ status: 'A', path: 'src/b.ts' },
		]);
		assert.strictEqual(expectations.length, 0);
	});
});
