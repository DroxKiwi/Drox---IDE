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
	callDroxProseLlm,
	parseDroxExplainParts,
	quietestOllamaThink,
	quietThinkingFields,
	readDroxLlmMessageChannels,
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

	test('ollama keeps thinking beside an empty answer', () => {
		const channels = readDroxLlmMessageChannels('ollama', JSON.stringify({
			message: { content: '', thinking: '{"file":"a.ts","items":[]}' },
		}));
		assert.strictEqual(channels.content, '');
		assert.ok(channels.reasoning.includes('"items"'));
	});

	test('openai-compatible reads text parts and reasoning content', () => {
		const channels = readDroxLlmMessageChannels('openai_compatible', JSON.stringify({
			choices: [{
				message: {
					content: [{ type: 'text', text: '{"links":[]}' }, { type: 'reasoning', text: 'thinking' }],
					reasoning_content: 'more',
				},
			}],
		}));
		assert.strictEqual(channels.content, '{"links":[]}');
		assert.ok(channels.reasoning.includes('thinking'));
		assert.ok(channels.reasoning.includes('more'));
	});

	test('ollama think picks false, otherwise the lowest named level', () => {
		assert.strictEqual(quietestOllamaThink([true, false]), false);
		assert.strictEqual(quietestOllamaThink(['low', 'high', 'max']), 'low');
		assert.strictEqual(quietestOllamaThink(['max', 'high']), 'high');
		assert.strictEqual(quietestOllamaThink(undefined), false);
	});

	test('each provider gets only the thinking field it accepts', () => {
		assert.deepStrictEqual(quietThinkingFields('ollama', 'low'), { think: 'low' });
		assert.deepStrictEqual(quietThinkingFields('ollama', false), { think: false });
		for (const provider of ['vllm', 'lmstudio', 'huggingface', 'openai_compatible'] as const) {
			assert.deepStrictEqual(quietThinkingFields(provider), { chat_template_kwargs: { enable_thinking: false } });
		}
		for (const provider of ['mistral', 'scaleway', 'ovhcloud'] as const) {
			assert.deepStrictEqual(quietThinkingFields(provider), {});
		}
	});

	test('an ollama call sends the quietest level advertised for that model', async () => {
		let chatBody = '';
		const text = await callDroxProseLlm({
			provider: 'ollama',
			server: 'https://ollama.com',
			model: 'glm-quiet-probe',
			disableThinking: true,
			fetchHttp: async (url, _headers, options) => {
				if (url.endsWith('/api/show')) {
					return { statusCode: 200, body: JSON.stringify({ thinking: { values: ['low', 'high', 'max'] } }) };
				}
				chatBody = options?.body ?? '';
				return { statusCode: 200, body: JSON.stringify({ message: { content: 'ok' } }) };
			},
		}, 'system', 'user');
		assert.strictEqual(text, 'ok');
		assert.strictEqual(JSON.parse(chatBody).think, 'low');
	});

	test('inline chat question is appended after the selection', () => {
		const message = buildDroxInlineChatUserMessage('python', 'x = 1', 'à quoi sert x ?');
		assert.ok(message.includes('x = 1'));
		assert.ok(message.endsWith('à quoi sert x ?'));
	});
});
