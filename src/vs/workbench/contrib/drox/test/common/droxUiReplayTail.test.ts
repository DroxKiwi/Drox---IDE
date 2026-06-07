/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	sliceTranscriptBeforeTurns,
	sliceTranscriptTailTurns,
	sliceUiReplayBeforeTurns,
	sliceUiReplayTailTurns,
} from '../../common/droxUiReplayTail.js';

suite('Drox UI replay tail', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sliceUiReplayTailTurns keeps last user turn only', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 'first' },
			{ kind: 'delta', text: 'a' },
			{ kind: 'append', role: 'user', text: 'second' },
			{ kind: 'delta', text: 'b' },
			{ kind: 'userFacingReply', text: 'done' },
		];
		const { slice, hasOlder } = sliceUiReplayTailTurns(journal, 1);
		assert.strictEqual(slice.length, 3);
		assert.strictEqual(slice[0].kind, 'append');
		assert.strictEqual((slice[0] as { role?: string }).role, 'user');
		assert.strictEqual((slice[0] as { text?: string }).text, 'second');
		assert.strictEqual(hasOlder, true);
	});

	test('sliceUiReplayTailTurns without user markers returns full journal', () => {
		const journal = [{ kind: 'delta', text: 'x' }, { kind: 'tool', phase: 'start' }];
		const { slice, hasOlder } = sliceUiReplayTailTurns(journal, 1);
		assert.strictEqual(slice.length, 2);
		assert.strictEqual(hasOlder, false);
	});

	test('sliceUiReplayBeforeTurns loads turn immediately before cursor', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 'first' },
			{ kind: 'delta', text: 'a' },
			{ kind: 'append', role: 'user', text: 'second' },
			{ kind: 'delta', text: 'b' },
		];
		const { slice, hasOlder, oldestLoadedIndex } = sliceUiReplayBeforeTurns(journal, 2, 1);
		assert.strictEqual(slice.length, 2);
		assert.strictEqual((slice[0] as { text?: string }).text, 'first');
		assert.strictEqual(hasOlder, false);
		assert.strictEqual(oldestLoadedIndex, 0);
	});

	test('sliceUiReplayBeforeTurns with two older turns paginates', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 't1' },
			{ kind: 'append', role: 'user', text: 't2' },
			{ kind: 'append', role: 'user', text: 't3' },
		];
		const tail = sliceUiReplayTailTurns(journal, 1);
		assert.strictEqual(tail.oldestLoadedIndex, 2);
		const page = sliceUiReplayBeforeTurns(journal, tail.oldestLoadedIndex, 1);
		assert.strictEqual(page.slice.length, 1);
		assert.strictEqual((page.slice[0] as { text?: string }).text, 't2');
		assert.strictEqual(page.hasOlder, true);
		assert.strictEqual(page.oldestLoadedIndex, 1);
		const page2 = sliceUiReplayBeforeTurns(journal, page.oldestLoadedIndex, 1);
		assert.strictEqual((page2.slice[0] as { text?: string }).text, 't1');
		assert.strictEqual(page2.hasOlder, false);
	});

	test('sliceTranscriptBeforeTurns loads prior user turn', () => {
		const transcript = [
			{ role: 'user' as const, content: [{ type: 'text', text: 'u1' }] },
			{ role: 'assistant' as const, content: [{ type: 'text', text: 'a1' }] },
			{ role: 'user' as const, content: [{ type: 'text', text: 'u2' }] },
			{ role: 'assistant' as const, content: [{ type: 'text', text: 'a2' }] },
		];
		const tail = sliceTranscriptTailTurns(transcript, 1);
		const page = sliceTranscriptBeforeTurns(transcript, tail.oldestLoadedIndex, 1);
		assert.strictEqual(page.messages.length, 2);
		assert.strictEqual(page.messages[0].role, 'user');
		assert.strictEqual(page.hasOlder, false);
	});

	test('sliceTranscriptTailTurns keeps last exchange', () => {
		const transcript = [
			{ role: 'user' as const, content: [{ type: 'text', text: 'u1' }] },
			{ role: 'assistant' as const, content: [{ type: 'text', text: 'a1' }] },
			{ role: 'user' as const, content: [{ type: 'text', text: 'u2' }] },
			{ role: 'assistant' as const, content: [{ type: 'text', text: 'a2' }] },
		];
		const { messages, hasOlder } = sliceTranscriptTailTurns(transcript, 1);
		assert.strictEqual(messages.length, 2);
		assert.strictEqual(messages[0].role, 'user');
		assert.strictEqual(hasOlder, true);
	});
});
