/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildAgentsShellTerminalToolSpecificData,
	buildShellToolFinishWire,
	buildShellToolStartWire,
	formatShellTerminalCommandOutputText,
	formatShellToolDisplayLabel,
} from '../../common/chat/droxShellToolWire.js';
import { describeToolCall } from '../../common/chat/droxToolPreview.js';

suite('Drox shell tool wire', () => {

	test('buildShellToolStartWire extracts bash command', () => {
		const wire = buildShellToolStartWire('bash', { command: 'git status', description: 'Check repo' });
		assert.ok(wire);
		assert.strictEqual(wire.shellCommand, 'git status');
		assert.strictEqual(wire.shellDescription, 'Check repo');
		assert.ok(wire.shellKind === 'cmd' || wire.shellKind === 'powershell' || wire.shellKind === 'bash');
	});

	test('buildShellToolStartWire ignores non-bash tools', () => {
		assert.strictEqual(buildShellToolStartWire('grep', { pattern: 'foo' }), undefined);
	});

	test('formatShellToolDisplayLabel prefers command over model description', () => {
		assert.strictEqual(
			formatShellToolDisplayLabel(
				'type "C:\\docs\\pedagogie\\README.md"',
				'Lit le README pedagogie apres le titre principal',
			),
			'type "C:\\docs\\pedagogie\\README.md" — Lit le README pedagogie apres le titre principal',
		);
		assert.strictEqual(
			formatShellToolDisplayLabel('git status', ''),
			'git status',
		);
		assert.strictEqual(
			formatShellToolDisplayLabel('git status', 'git status'),
			'git status',
		);
	});

	test('describeToolCall file_read includes line range', () => {
		assert.deepStrictEqual(
			describeToolCall('file_read', { path: 'docs/README.md', start_line: 12, end_line: 40 }),
			{ verb: 'Read', target: 'docs/README.md:12-40' },
		);
		assert.deepStrictEqual(
			describeToolCall('file_read', { path: 'docs/README.md' }),
			{ verb: 'Read', target: 'docs/README.md' },
		);
	});

	test('buildShellToolFinishWire maps structured output', () => {
		const wire = buildShellToolFinishWire('bash', {
			stdout: 'ok\n',
			stderr: '',
			exit_code: 0,
			duration_ms: 42,
			terminal_instance_id: 7,
		}, false);
		assert.ok(wire);
		assert.strictEqual(wire.stdout, 'ok\n');
		assert.strictEqual(wire.exit_code, 0);
		assert.strictEqual(wire.duration_ms, 42);
		assert.strictEqual(wire.terminal_instance_id, 7);
	});

	test('buildShellToolFinishWire maps errors', () => {
		const wire = buildShellToolFinishWire('bash', { error: 'spawn failed' }, true);
		assert.ok(wire);
		assert.strictEqual(wire.error, 'spawn failed');
	});

	test('buildShellToolFinishWire maps skipped by user', () => {
		const wire = buildShellToolFinishWire('bash', {
			error: 'Skipped by user',
			skipped: true,
			stdout: 'partial\n',
		}, true);
		assert.ok(wire);
		assert.strictEqual(wire.skipped, true);
		assert.strictEqual(wire.error, 'Skipped by user');
	});

	test('formatShellTerminalCommandOutputText normalizes newlines for xterm', () => {
		assert.strictEqual(
			formatShellTerminalCommandOutputText({ stdout: 'a\nb\n', stderr: 'err\n' }),
			'a\r\nb\r\nerr',
		);
	});

	test('buildAgentsShellTerminalToolSpecificData start has command only', () => {
		const start = buildShellToolStartWire('bash', { command: 'git status', description: 'Check' })!;
		const data = buildAgentsShellTerminalToolSpecificData(start);
		assert.strictEqual(data.kind, 'terminal');
		assert.strictEqual(data.commandLine.original, 'git status');
		assert.strictEqual(data.terminalCommandOutput, undefined);
		assert.strictEqual(data.terminalCommandState, undefined);
	});

	test('buildAgentsShellTerminalToolSpecificData finish includes collapsible output', () => {
		const start = buildShellToolStartWire('bash', { command: 'echo hi' })!;
		const finish = buildShellToolFinishWire('bash', {
			stdout: 'hi\n',
			stderr: '',
			exit_code: 0,
			duration_ms: 12,
		}, false)!;
		const data = buildAgentsShellTerminalToolSpecificData(start, finish, false);
		assert.strictEqual(data.terminalCommandOutput?.text, 'hi');
		assert.strictEqual(data.terminalCommandState?.exitCode, 0);
		assert.strictEqual(data.terminalCommandState?.duration, 12);
	});
});
