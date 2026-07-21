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
	mapDroxTodosToAgentsChatTodoList,
	shouldPreferDroxAgentsStreamOverCanonicalReply,
} from '../../browser/agents/droxAgentsChatSink.js';
import { isDroxThinkingRoute } from '../../common/droxPhaseRoute.js';
import { resetDroxWarmupPhraseIndexForTest } from '../../common/droxWarmupPhrase.js';

function agentEvent(kind: string, fields: Record<string, unknown> = {}): unknown {
	return { event: { kind, ...fields } };
}

suite('Drox — droxAgentsChatSink', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		resetDroxWarmupPhraseIndexForTest();
	});

	test('create pushes droxWarmup progress before agent events', () => {
		const parts: IChatProgress[] = [];
		createDroxAgentsChatSink(p => parts.push(...p));

		assert.strictEqual(parts.length, 1);
		assert.strictEqual(parts[0].kind, 'droxWarmup');
		if (parts[0].kind === 'droxWarmup') {
			assert.ok(parts[0].phrase.length > 0);
		}
	});

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

		assert.strictEqual(parts.length, 2);
		assert.strictEqual(parts[0].kind, 'droxWarmup');
		assert.strictEqual(parts[1].kind, 'thinking');
		if (parts[1].kind === 'thinking') {
			assert.strictEqual(parts[1].value, 'Planning…');
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

	test('text_delta during reading/acting routes to thinking (AMB-09 wide set)', () => {
		for (const phase of ['reading', 'acting', 'planning', 'verifying'] as const) {
			const parts: IChatProgress[] = [];
			const sink = createDroxAgentsChatSink(p => parts.push(...p));
			sink.handleAgentEvent(agentEvent('phase_enter', { phase }));
			sink.handleAgentEvent(agentEvent('text_delta', { text: `${phase}-note` }));
			const thinking = parts.filter(p => p.kind === 'thinking');
			assert.strictEqual(thinking.length, 1, phase);
			assert.strictEqual(sink.assistantText, '');
		}
	});

	test('isDroxThinkingRoute — answering visible, rest thinking', () => {
		assert.strictEqual(isDroxThinkingRoute('answering'), false);
		assert.strictEqual(isDroxThinkingRoute('done'), false);
		assert.strictEqual(isDroxThinkingRoute('reading'), true);
		assert.strictEqual(isDroxThinkingRoute(null), true);
		assert.strictEqual(isDroxThinkingRoute('unknown_phase'), true);
	});

	test('mapDroxTodosToAgentsChatTodoList surfaces cancelled in title (AMB-03)', () => {
		const mapped = mapDroxTodosToAgentsChatTodoList([
			{ id: '1', content: 'Write docs', status: 'cancelled' },
			{ id: '2', content: 'Ship', status: 'completed' },
		]);
		assert.strictEqual(mapped[0].status, 'not-started');
		assert.ok(mapped[0].title.includes('cancelled'));
		assert.strictEqual(mapped[1].status, 'completed');
		assert.strictEqual(mapped[1].title, 'Ship');
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

	test('handleAgentDone invokes onAgentRunEnded for completed and error', () => {
		let ended = 0;
		const sinkOk = createDroxAgentsChatSink(() => { }, {
			onAgentRunEnded: () => { ended++; },
		});
		sinkOk.handleAgentDone({ status: 'completed' });
		assert.strictEqual(ended, 1);

		const sinkErr = createDroxAgentsChatSink(() => { }, {
			onAgentRunEnded: () => { ended++; },
		});
		sinkErr.handleAgentDone({ status: 'error', error: 'boom' });
		assert.strictEqual(ended, 2);
	});

	test('handleAgentDone rewrites loop detected for Agents UX', () => {
		const parts: IChatProgress[] = [];
		const sink = createDroxAgentsChatSink(p => parts.push(...p));
		sink.handleAgentDone({ status: 'error', error: 'Loop detected: both' });
		const markdown = parts.filter(p => p.kind === 'markdownContent');
		assert.strictEqual(markdown.length, 1);
		if (markdown[0].kind === 'markdownContent') {
			assert.ok(/looping|unresolved loop/i.test(markdown[0].content.value));
			assert.ok(!/Loop detected: both/.test(markdown[0].content.value));
		}
	});

	test('todo_write finish invokes onTodosUpdated for plan widget', () => {
		const updates: { id: string; title: string; status: string }[][] = [];
		const sink = createDroxAgentsChatSink(() => { }, {
			onTodosUpdated: list => updates.push([...list]),
		});
		sink.handleAgentEvent(agentEvent('tool_start', {
			id: 't1',
			name: 'todo_write',
			arguments: { todos: [] },
		}));
		sink.handleAgentEvent(agentEvent('tool_finish', {
			id: 't1',
			output: {
				todos: [
					{ id: 1, content: 'Write TUI page', status: 'in_progress' },
					{ id: '2', content: 'Write IDE page', status: 'pending' },
				],
			},
		}));
		assert.strictEqual(updates.length, 1);
		assert.strictEqual(updates[0].length, 2);
		assert.strictEqual(updates[0][0].id, '1');
		assert.strictEqual(updates[0][0].title, 'Write TUI page');
		assert.strictEqual(updates[0][0].status, 'in-progress');
		assert.strictEqual(updates[0][1].status, 'not-started');
	});
});
