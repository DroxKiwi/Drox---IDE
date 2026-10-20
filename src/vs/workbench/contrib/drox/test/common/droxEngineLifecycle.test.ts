/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	droxEngineEnvFingerprint,
	isDroxEngineStaleClientError,
	parseAgentDoneRunId,
	shouldDeferEngineDispose,
	shouldReuseDroxEngineHost,
} from '../../common/droxEngineLifecycle.js';

suite('droxEngineLifecycle', () => {
	test('env fingerprint is order-independent', () => {
		assert.strictEqual(
			droxEngineEnvFingerprint({ B: '2', A: '1' }),
			droxEngineEnvFingerprint({ A: '1', B: '2' }),
		);
	});

	test('reuse when same fingerprint and alive', () => {
		assert.strictEqual(shouldReuseDroxEngineHost({
			existing: {
				executable: 'C:/drox.exe',
				cwd: 'C:/ws',
				envFingerprint: 'A=1',
				alive: true,
			},
			nextExecutable: 'C:/drox.exe',
			nextCwd: 'C:/ws',
			nextEnvFingerprint: 'A=1',
		}), true);
	});

	test('no reuse when dead or fingerprint differs', () => {
		assert.strictEqual(shouldReuseDroxEngineHost({
			existing: {
				executable: 'C:/drox.exe',
				cwd: 'C:/ws',
				envFingerprint: 'A=1',
				alive: false,
			},
			nextExecutable: 'C:/drox.exe',
			nextCwd: 'C:/ws',
			nextEnvFingerprint: 'A=1',
		}), false);
		assert.strictEqual(shouldReuseDroxEngineHost({
			existing: {
				executable: 'C:/drox.exe',
				cwd: 'C:/ws',
				envFingerprint: 'A=1',
				alive: true,
			},
			nextExecutable: 'C:/drox.exe',
			nextCwd: 'C:/other',
			nextEnvFingerprint: 'A=1',
		}), false);
	});

	test('defer dispose while busy except shutdown', () => {
		assert.strictEqual(shouldDeferEngineDispose('respawn-binary', true), true);
		assert.strictEqual(shouldDeferEngineDispose('respawn-settings', true), true);
		assert.strictEqual(shouldDeferEngineDispose('start-replace', true), true);
		assert.strictEqual(shouldDeferEngineDispose('explicit', true), true);
		assert.strictEqual(shouldDeferEngineDispose('shutdown', true), false);
		assert.strictEqual(shouldDeferEngineDispose('respawn-binary', false), false);
	});

	test('parseAgentDoneRunId', () => {
		assert.strictEqual(parseAgentDoneRunId({ runId: 'run_1' }), 'run_1');
		assert.strictEqual(parseAgentDoneRunId({}), undefined);
		assert.strictEqual(parseAgentDoneRunId(null), undefined);
	});

	test('isDroxEngineStaleClientError', () => {
		assert.ok(isDroxEngineStaleClientError(new Error('drox client closed')));
		assert.ok(isDroxEngineStaleClientError(new Error('Drox engine not started for this window')));
		assert.ok(!isDroxEngineStaleClientError(new Error('JSON-RPC -32603: boom')));
		assert.ok(!isDroxEngineStaleClientError(undefined));
	});
});
