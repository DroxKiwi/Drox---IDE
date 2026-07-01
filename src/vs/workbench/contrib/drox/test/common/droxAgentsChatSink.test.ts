/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatProgress } from '../../../../contrib/chat/common/chatService/chatService.js';
import {
	createDroxAgentsChatSink,
	extractDroxAgentsAnsweringOnlyText,
	shouldPreferDroxAgentsStreamOverCanonicalReply,
} from '../../browser/agents/droxAgentsChatSink.js';

function agentEvent(kind: string, fields: Record<string, unknown> = {}): unknown {
	return { event: { kind, ...fields } };
}

suite('Drox — droxAgentsChatSink', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('text_delta streams incremental markdown during answering', () => {
		const parts: IChatProgress[] = [];
		const sink = createDroxAgentsChatSink(p => parts.push(...p));

		sink.handleAgentEvent(agentEvent('phase_enter', { phase: 'answering' }));
		sink.handleAgentEvent(agentEvent('text_delta', { text: 'Salut' }));
		sink.handleAgentEvent(agentEvent('text_delta', { text: ' !' }));

		const markdown = parts.filter(p => p.kind === 'markdownContent');
		assert.strictEqual(markdown.length, 2);
		assert.strictEqual(markdown[0].kind === 'markdownContent' ? markdown[0].content.value : '', 'Salut');
		assert.strictEqual(markdown[1].kind === 'markdownContent' ? markdown[1].content.value : '', ' !');
		assert.strictEqual(sink.assistantText, 'Salut !');
	});

	test('text_delta during internal_reasoning routes to thinking', () => {
		const parts: IChatProgress[] = [];
		const sink = createDroxAgentsChatSink(p => parts.push(...p));

		sink.handleAgentEvent(agentEvent('phase_enter', { phase: 'internal_reasoning' }));
		sink.handleAgentEvent(agentEvent('text_delta', { text: 'Planning…' }));

		assert.strictEqual(parts.length, 1);
		assert.strictEqual(parts[0].kind, 'thinking');
		if (parts[0].kind === 'thinking') {
			assert.strictEqual(parts[0].value, 'Planning…');
		}
		assert.strictEqual(sink.assistantText, '');
	});

	test('user_facing_reply appends only missing suffix after streamed answer', () => {
		const parts: IChatProgress[] = [];
		const sink = createDroxAgentsChatSink(p => parts.push(...p));

		sink.handleAgentEvent(agentEvent('phase_enter', { phase: 'answering' }));
		sink.handleAgentEvent(agentEvent('text_delta', { text: 'Hello' }));
		sink.handleAgentEvent(agentEvent('user_facing_reply', {
			text: '[phase: answering]\nHello world',
		}));

		const markdown = parts.filter(p => p.kind === 'markdownContent');
		assert.strictEqual(markdown.length, 2);
		assert.strictEqual(markdown[0].kind === 'markdownContent' ? markdown[0].content.value : '', 'Hello');
		assert.strictEqual(markdown[1].kind === 'markdownContent' ? markdown[1].content.value : '', ' world');
		assert.strictEqual(sink.assistantText, 'Hello world');
	});

	test('extractDroxAgentsAnsweringOnlyText strips phase markers', () => {
		const raw = '[phase: internal_reasoning]\nhidden\n[phase: answering]\nVisible answer\n[phase: done]\ntrailer';
		assert.strictEqual(extractDroxAgentsAnsweringOnlyText(raw), 'Visible answer');
	});

	test('shouldPreferDroxAgentsStreamOverCanonicalReply prefers longer streamed text', () => {
		const streamed = 'Here is the full answer with extra detail.';
		const canon = 'full answer';
		assert.strictEqual(shouldPreferDroxAgentsStreamOverCanonicalReply(streamed, canon), true);
		assert.strictEqual(shouldPreferDroxAgentsStreamOverCanonicalReply('', canon), false);
		assert.strictEqual(shouldPreferDroxAgentsStreamOverCanonicalReply(streamed, streamed), false);
	});

	test('file_edit tool_finish emits externalEdit progress', async () => {
		const parts: IChatProgress[] = [];
		const filePath = 'C:/ws/src/foo.ts';
		const fileService = {
			readFile: async () => ({ value: { toString: () => 'after\n' } }),
			writeFile: async () => undefined,
		};
		const runRevertService = {
			getCapturedBefore: () => ({ beforeContent: 'before\n', hadFile: true }),
			trackFileChange: () => undefined,
		};
		const sink = createDroxAgentsChatSink(p => parts.push(...p), {
			workspaceRoot: 'C:/ws',
			fileService: fileService as never,
			runRevertService: runRevertService as never,
		});

		sink.handleAgentEvent(agentEvent('tool_start', {
			id: 'tool_1',
			name: 'file_edit',
			arguments: { path: 'src/foo.ts' },
		}));
		sink.handleAgentEvent(agentEvent('tool_finish', {
			id: 'tool_1',
			output: { path: filePath, edits_applied: 1, diff: '--- a\n+++ b\n-before\n+after\n' },
		}));

		await new Promise<void>(resolve => setTimeout(resolve, 0));

		const external = parts.filter(p => p.kind === 'externalEdit');
		assert.strictEqual(external.length, 1);
		if (external[0].kind === 'externalEdit') {
			assert.strictEqual(external[0].uri.fsPath.replace(/\\/g, '/'), filePath);
			assert.strictEqual(external[0].diff?.added, 1);
			assert.strictEqual(external[0].diff?.removed, 1);
		}
		const commands = parts.filter(p => p.kind === 'command');
		assert.strictEqual(commands.length, 1);
	});
});
