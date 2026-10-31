/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildDroxAnalysisExport } from '../../../common/chat/droxAnalysisExport.js';

suite('Drox — analysis export', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('long tool body is stored once and the index points at the anchor', () => {
		const body = 'x'.repeat(500);
		const prompt = 'S'.repeat(500);
		const capture = [
			JSON.stringify({
				kind: 'llm_request',
				turn: 1,
				loop: 'none',
				beforeChars: 10,
				transportChars: 20,
				duplicateUsersDropped: 0,
				danglingToolCalls: false,
				messages: [
					{ role: 'system', id: 'session.core', kind: 'prompt', chars: prompt.length, text: prompt },
					{ role: 'user', chars: 5, text: 'Salut' },
					{ role: 'tool', name: 'file_read', error: false, chars: body.length, text: body },
					{ role: 'tool', name: 'file_read', error: false, chars: body.length, text: body },
				],
			}),
			JSON.stringify({
				kind: 'llm_result',
				turn: 1,
				inputTokens: 3,
				outputTokens: 4,
				phase: 'reading',
				textualTool: false,
				toolCalls: [{ name: 'file_read', count: 2, identical: true, truncated: 0 }],
			}),
		].join('\n');

		const exported = buildDroxAnalysisExport({ sessionId: 'ses_test', runCaptureRaw: capture });
		const bodyBlob = exported.blobs.find(blob => blob.text === body);
		const promptBlob = exported.blobs.find(blob => blob.text === prompt);
		assert.ok(bodyBlob);
		assert.ok(promptBlob);
		assert.strictEqual(exported.blobs.length, 2);
		assert.ok(exported.index.includes('tour-1'));
		assert.ok(exported.index.includes('outil-file_read-1'));
		assert.ok(exported.index.includes(`blob=${promptBlob.hash}`));
		assert.ok(exported.index.includes('identical=file_read'));
		const lines = exported.transcript.trim().split('\n');
		assert.ok(lines.every(row => row.length < 2000));
		assert.strictEqual(lines.filter(row => row.includes(bodyBlob.hash)).length, 2);
		assert.ok(!exported.transcript.includes(body));
		assert.ok(!exported.transcript.includes(prompt));
	});

	test('a stopped command is an anchor, and its sentence stays out of a long line', () => {
		const sentence = 'The user stopped this command. Resume the current task without running this command again.';
		const capture = [
			JSON.stringify({
				kind: 'llm_request',
				turn: 4,
				loop: 'ok',
				messages: [
					{ role: 'tool', name: 'bash', error: true, chars: sentence.length, text: sentence },
				],
			}),
			JSON.stringify({
				kind: 'llm_result',
				turn: 4,
				phase: 'done',
				toolCalls: [{ name: 'bash', count: 1, identical: false, truncated: 0 }],
			}),
		].join('\n');
		const exported = buildDroxAnalysisExport({ sessionId: 'ses_stop', runCaptureRaw: capture });
		assert.ok(exported.index.includes('anomaly stopped=1 anchors=outil-bash-1'));
		assert.ok(exported.transcript.includes(sentence));
		assert.strictEqual(exported.blobs.length, 0);
	});
});
