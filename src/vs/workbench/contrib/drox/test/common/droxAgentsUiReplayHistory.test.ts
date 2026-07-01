/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DroxHostToWebviewMessage } from '../../browser/droxChatBridge.js';
import { IDroxTranscriptMessage } from '../../common/droxSession.js';
import { buildDroxAgentsHistoryFromTranscript, buildDroxAgentsHistoryFromUiReplay } from '../../browser/agents/droxAgentsUiReplayHistory.js';

suite('DroxAgentsUiReplayHistory', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ui replay — user turn with thinking and canonical reply', () => {
		const journal: DroxHostToWebviewMessage[] = [
			{ kind: 'append', role: 'user', text: 'Salut' },
			{ kind: 'phase', phase: 'internal_reasoning' },
			{ kind: 'delta', text: 'Salut ! ' },
			{ kind: 'delta', text: 'Comment puis-je vous aider ?' },
			{ kind: 'phase', close: true },
			{ kind: 'userFacingReply', text: 'Bonjour ! Comment puis-je t\'aider aujourd\'hui ?' },
		];
		const history = buildDroxAgentsHistoryFromUiReplay(journal);
		assert.strictEqual(history.length, 2);
		assert.strictEqual(history[0].type, 'request');
		if (history[0].type === 'request') {
			assert.strictEqual(history[0].prompt, 'Salut');
		}
		assert.strictEqual(history[1].type, 'response');
		if (history[1].type === 'response') {
			assert.ok(history[1].parts.some(p => p.kind === 'thinking'));
			assert.ok(history[1].parts.some(p =>
				p.kind === 'markdownContent' && String(p.content.value).includes('Bonjour')));
		}
	});

	test('ui replay — multi-turn session', () => {
		const journal: DroxHostToWebviewMessage[] = [
			{ kind: 'append', role: 'user', text: 'First' },
			{ kind: 'delta', text: 'Answer one.' },
			{ kind: 'append', role: 'user', text: 'Second' },
			{ kind: 'delta', text: 'Answer two.' },
		];
		const history = buildDroxAgentsHistoryFromUiReplay(journal);
		assert.strictEqual(history.length, 4);
		assert.strictEqual(history[0].type, 'request');
		assert.strictEqual(history[2].type, 'request');
		if (history[2].type === 'request') {
			assert.strictEqual(history[2].prompt, 'Second');
		}
	});

	test('ui replay — file change card in response', () => {
		const journal: DroxHostToWebviewMessage[] = [
			{ kind: 'append', role: 'user', text: 'Edit file' },
			{
				kind: 'fileChange',
				op: 'edit',
				path: '/ws/test.md',
				relPath: 'test.md',
				added: 1,
				removed: 0,
				diff: '+hello',
				content: '',
				language: 'markdown',
				applied: true,
				toolId: 'tool-1',
			},
		];
		const history = buildDroxAgentsHistoryFromUiReplay(journal);
		assert.strictEqual(history.length, 2);
		if (history[1].type === 'response') {
			assert.ok(history[1].parts.some(p => p.kind === 'externalEdit'));
			assert.ok(history[1].parts.some(p => p.kind === 'markdownContent'));
		}
	});

	test('ui replay — user message with image attachments', () => {
		const journal: DroxHostToWebviewMessage[] = [
			{
				kind: 'append',
				role: 'user',
				text: 'What is this?',
				images: [{ relPath: '.drox/attachments/a.png', dataUrl: 'data:image/png;base64,QQ==' }],
			},
		];
		const history = buildDroxAgentsHistoryFromUiReplay(journal);
		assert.strictEqual(history.length, 1);
		if (history[0].type === 'request') {
			assert.strictEqual(history[0].prompt, 'What is this?');
			assert.strictEqual(history[0].variableData?.variables.length, 1);
		}
	});

	test('transcript fallback — user and assistant pairs', () => {
		const messages: IDroxTranscriptMessage[] = [
			{ role: 'user', content: [{ type: 'text', text: 'Hi' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'Hello there' }] },
		];
		const history = buildDroxAgentsHistoryFromTranscript(messages);
		assert.strictEqual(history.length, 2);
		if (history[0].type === 'request') {
			assert.strictEqual(history[0].prompt, 'Hi');
		}
		if (history[1].type === 'response') {
			assert.ok(history[1].parts.some(p =>
				p.kind === 'markdownContent' && String(p.content.value).includes('Hello')));
		}
	});
});
