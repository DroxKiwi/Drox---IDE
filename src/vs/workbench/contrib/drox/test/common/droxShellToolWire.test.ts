/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildShellToolFinishWire, buildShellToolStartWire } from '../../common/chat/droxShellToolWire.js';

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

	test('buildShellToolFinishWire maps structured output', () => {
		const wire = buildShellToolFinishWire('bash', {
			stdout: 'ok\n',
			stderr: '',
			exit_code: 0,
			duration_ms: 42,
		}, false);
		assert.ok(wire);
		assert.strictEqual(wire.stdout, 'ok\n');
		assert.strictEqual(wire.exit_code, 0);
		assert.strictEqual(wire.duration_ms, 42);
	});

	test('buildShellToolFinishWire maps errors', () => {
		const wire = buildShellToolFinishWire('bash', { error: 'spawn failed' }, true);
		assert.ok(wire);
		assert.strictEqual(wire.error, 'spawn failed');
	});
});
