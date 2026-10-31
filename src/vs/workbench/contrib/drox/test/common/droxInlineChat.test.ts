/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildDroxExplainUserMessage,
	buildDroxInlineChatUserMessage,
	DROX_EXPLAIN_SYSTEM_PROMPT,
	formatDroxExplainComment,
	parseDroxExplainParts,
} from '../../common/droxInlineChat.js';

suite('Drox inline chat prompts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('explain message is only the snippet', () => {
		const message = buildDroxExplainUserMessage('python', 'x = len(items)');
		assert.ok(message.includes('langage: python'));
		assert.ok(message.includes('x = len(items)'));
		assert.ok(!/file|workspace/i.test(message));
	});

	test('explain prompt asks for one part per line', () => {
		assert.ok(/extrait \| rôle \| explication/.test(DROX_EXPLAIN_SYSTEM_PROMPT));
	});

	test('explain parts split code, role and sentence', () => {
		const parts = parseDroxExplainParts('x | variable | Déclarée pour recevoir len.\n= | opérateur | Affecte la droite à x.');
		assert.strictEqual(parts.length, 2);
		assert.deepStrictEqual(parts[0], { code: 'x', role: 'variable', text: 'Déclarée pour recevoir len.' });
	});

	test('explain comment keeps one part per line', () => {
		assert.strictEqual(
			formatDroxExplainComment('python', 'x | variable | Déclarée pour recevoir len.'),
			'# x — variable : Déclarée pour recevoir len.\n',
		);
	});

	test('inline chat question is appended after the selection', () => {
		const message = buildDroxInlineChatUserMessage('python', 'x = 1', 'à quoi sert x ?');
		assert.ok(message.includes('x = 1'));
		assert.ok(message.endsWith('à quoi sert x ?'));
	});
});
