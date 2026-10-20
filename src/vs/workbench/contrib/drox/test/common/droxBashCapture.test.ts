/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	bufferDeltaSinceDroxBash,
	isolateDroxBashCapturedStdout,
	stripDroxBashShellChrome,
} from '../../common/droxBashCapture.js';
import {
	droxBashResultIsToolError,
	droxBashShouldRetryExecBashAfterIde,
} from '../../common/droxBashToolResult.js';

suite('Drox bash capture (lot capture)', () => {
	test('strips Windows banner + prompt-only chrome', () => {
		const raw =
			'Microsoft Windows [version 10.0.26300.9711]\n(c) Microsoft Corporation. Tous droits réservés.\nC:\\Users\\coren\\Desktop\\GitHub\\site-kdds>';
		assert.strictEqual(stripDroxBashShellChrome(raw), '');
		assert.strictEqual(stripDroxBashShellChrome('C:\\Users\\coren\\Desktop\\GitHub\\site-kdds>'), '');
	});

	test('keeps real output and strips trailing prompt', () => {
		const raw = ' M README.md\nC:\\Users\\coren\\Desktop\\GitHub\\site-kdds>';
		assert.strictEqual(stripDroxBashShellChrome(raw), ' M README.md');
	});

	test('isolate prefers marker slice over stale before', () => {
		const marker = '__DROX_BASH_test__';
		const before = 'stale scrollback\n';
		const after = `stale scrollback\n${marker}\nhello\nC:\\proj>`;
		assert.strictEqual(
			isolateDroxBashCapturedStdout('', marker, before, after),
			'hello',
		);
	});

	test('P0: empty SI marker slice falls through to buffer content', () => {
		const marker = '__DROX_BASH_test__';
		const before = 'C:\\proj>\n';
		// SI saw marker only (empty after) — classic cmd.exe getOutput miss.
		const si = `${marker}\n`;
		const after = `${before}${marker}\n M README.md\nC:\\proj>`;
		assert.strictEqual(
			isolateDroxBashCapturedStdout(si, marker, before, after),
			' M README.md',
		);
	});

	test('P0: prefers longer buffer slice over short SI slice', () => {
		const marker = '__DROX_BASH_test__';
		const before = 'prompt>\n';
		const si = `${marker}\npartial`;
		const after = `${before}${marker}\npartial\nfull line\nC:\\proj>`;
		assert.strictEqual(
			isolateDroxBashCapturedStdout(si, marker, before, after),
			'partial\nfull line',
		);
	});

	test('buffer delta empty when cannot isolate', () => {
		assert.strictEqual(bufferDeltaSinceDroxBash('abc', 'xyz'), '');
		assert.strictEqual(bufferDeltaSinceDroxBash('ab', 'abcd'), 'cd');
	});
});

suite('Drox bash tool result (lot result)', () => {
	test('null exit_code with stdout is not an error', () => {
		assert.strictEqual(
			droxBashResultIsToolError({
				command: 'git status',
				exit_code: null,
				stdout: ' M README.md',
				stderr: '',
				timed_out: false,
				duration_ms: 10,
			}),
			false,
		);
	});

	test('timed_out and non-zero exit are errors', () => {
		assert.strictEqual(
			droxBashResultIsToolError({
				command: 'x',
				exit_code: null,
				stdout: '',
				stderr: '',
				timed_out: true,
				duration_ms: 60_000,
			}),
			true,
		);
		assert.strictEqual(
			droxBashResultIsToolError({
				command: 'x',
				exit_code: 1,
				stdout: 'fail',
				stderr: '',
				timed_out: false,
				duration_ms: 10,
			}),
			true,
		);
	});

	test('P1: retry ExecBash when IDE empty on inspect command', () => {
		assert.strictEqual(
			droxBashShouldRetryExecBashAfterIde(
				{
					command: 'git status',
					exit_code: 0,
					stdout: '',
					stderr: '',
					timed_out: false,
					duration_ms: 500,
					terminal_instance_id: 2,
				},
				'git status',
			),
			true,
		);
	});

	test('P1: no retry when stdout present, reveal, mutate, or no IDE id', () => {
		assert.strictEqual(
			droxBashShouldRetryExecBashAfterIde(
				{
					command: 'git status',
					exit_code: 0,
					stdout: 'ok',
					stderr: '',
					timed_out: false,
					duration_ms: 10,
					terminal_instance_id: 2,
				},
				'git status',
			),
			false,
		);
		assert.strictEqual(
			droxBashShouldRetryExecBashAfterIde(
				{
					command: 'npm run dev',
					exit_code: 0,
					stdout: '',
					stderr: '',
					timed_out: false,
					duration_ms: 10,
					terminal_instance_id: 2,
				},
				'npm run dev',
			),
			false,
		);
		assert.strictEqual(
			droxBashShouldRetryExecBashAfterIde(
				{
					command: 'echo hi > file.txt',
					exit_code: 0,
					stdout: '',
					stderr: '',
					timed_out: false,
					duration_ms: 10,
					terminal_instance_id: 2,
				},
				'echo hi > file.txt',
			),
			false,
		);
		assert.strictEqual(
			droxBashShouldRetryExecBashAfterIde(
				{
					command: 'git status',
					exit_code: 0,
					stdout: '',
					stderr: '',
					timed_out: false,
					duration_ms: 10,
				},
				'git status',
			),
			false,
		);
	});
});
