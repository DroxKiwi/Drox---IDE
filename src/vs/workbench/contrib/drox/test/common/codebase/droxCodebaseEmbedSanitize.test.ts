/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	isEmbedNulByteError,
	prepareChunkForEmbed,
} from '../../../common/codebase/index/droxCodebaseEmbedSanitize.js';
import { buildDroxCodebaseEmbedIssueAlerts } from '../../../common/codebase/supervision/droxCodebaseEmbedIssueAlerts.js';
import { IDroxCodebasePipelineEvent } from '../../../common/codebase/droxCodebaseTypes.js';

suite('DroxCodebaseEmbedSanitize', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('strips NUL but still encodes when residual text remains', () => {
		const prepared = prepareChunkForEmbed({
			id: 'a:1-2:1',
			path: 'docs/bad.bin.txt',
			startLine: 1,
			endLine: 2,
			text: 'hello\u0000world',
		});
		assert.strictEqual(prepared.skipEncode, false);
		assert.strictEqual(prepared.text, 'helloworld');
		assert.strictEqual(prepared.issues[0]?.reason, 'null_byte');
		assert.ok(prepared.issues[0]?.guidance.includes('Exclude'));
	});

	test('skips binary control-heavy content', () => {
		const binary = Array.from({ length: 50 }, (_, i) => String.fromCharCode(i === 9 ? 65 : 1)).join('');
		const prepared = prepareChunkForEmbed({
			id: 'b:1-1:1',
			path: 'assets/blob.dat',
			startLine: 1,
			endLine: 1,
			text: binary,
		});
		assert.strictEqual(prepared.skipEncode, true);
		assert.strictEqual(prepared.issues[0]?.reason, 'binary_control');
	});

	test('detects nul byte RPC errors', () => {
		assert.strictEqual(isEmbedNulByteError(new Error('embed failed: nul byte found in provided data at position: 137')), true);
		assert.strictEqual(isEmbedNulByteError(new Error('timeout')), false);
	});
});

suite('DroxCodebaseEmbedIssueAlerts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds partial + path alerts from pipeline events', () => {
		const events: IDroxCodebasePipelineEvent[] = [
			{ id: '1', at: 1, runId: 'r1', kind: 'run_start', status: 'running', message: 'start' },
			{
				id: '2', at: 2, runId: 'r1', kind: 'embed_batch', status: 'warn',
				message: 'skip', path: 'docs/a.pdf',
				detail: { embedIssue: true, reason: 'null_byte', action: 'sanitized', guidance: 'Exclude it.' },
			},
			{
				id: '3', at: 3, runId: 'r1', kind: 'embed_batch', status: 'warn',
				message: 'partial',
				detail: { partial: true, skippedFiles: 1, vectors: 10 },
			},
			{ id: '4', at: 4, runId: 'r1', kind: 'run_done', status: 'ok', message: 'done' },
		];
		const alerts = buildDroxCodebaseEmbedIssueAlerts(events);
		assert.ok(alerts.some(a => a.code === 'EMBED_PARTIAL'));
		assert.ok(alerts.some(a => a.code === 'EMBED_CHUNK_SKIPPED' && a.message.includes('docs/a.pdf')));
		assert.ok(alerts.every(a => a.id.startsWith('index-embed-')));
	});
});
