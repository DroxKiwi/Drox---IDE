/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxModelQuestionVariant } from '../droxModelQuestionTypes.js';

/**
 * Classify whether the latest user message is real work (needs a plan) vs chitchat.
 * Output MUST be a single JSON object (no markdown):
 * { "isWork": boolean }
 */
const SYSTEM_V1 = [
	'You classify the user message for a coding agent session.',
	'Reply with ONE JSON object only. No markdown fences. No commentary.',
	'Schema: { "isWork": boolean }',
	'isWork=true when the user asks for work: explore, implement, fix, refactor, document, plan, investigate, update pages, etc.',
	'isWork=false for greetings, thanks, pure chitchat, or acknowledgements with no ask.',
	'When unsure but a concrete deliverable is implied, prefer isWork=true.',
].join('\n');

const USER_V1 = [
	'User message:',
	'"""',
	'{{userMessage}}',
	'"""',
	'Return {"isWork":boolean} now.',
].join('\n');

const SYSTEM_V1_COMPACT = [
	'Emit one JSON object only: {"isWork":boolean}.',
	'true = work request (code/docs/explore/fix/plan). false = chitchat/greeting only.',
].join(' ');

export const USER_MESSAGE_IS_WORK_VARIANTS: readonly IDroxModelQuestionVariant[] = [
	{
		questionId: 'session.user_message_is_work',
		variantId: 'v1',
		language: 'en',
		intent: 'Decide if the user message requires a work plan (vs discussion)',
		system: SYSTEM_V1,
		userTemplate: USER_V1,
	},
	{
		questionId: 'session.user_message_is_work',
		variantId: 'v1-compact',
		language: 'en',
		intent: 'Shorter isWork classifier for small / fast models',
		system: SYSTEM_V1_COMPACT,
		userTemplate: USER_V1,
	},
];
