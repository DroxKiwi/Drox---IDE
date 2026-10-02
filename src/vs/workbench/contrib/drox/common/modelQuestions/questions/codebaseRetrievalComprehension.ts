/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxModelQuestionVariant } from '../droxModelQuestionTypes.js';

/**
 * Comprehension ask before codebase retrieval.
 * Output MUST be a single JSON object (no markdown):
 * {
 *   "searchQuery": string,
 *   "pathPrefixes": string[],
 *   "preferCodeFiles": boolean,
 *   "skipRetrieval": boolean
 * }
 */
const SYSTEM_V1 = [
	'You rewrite a user workspace message into a retrieval filter for a local code index.',
	'Reply with ONE JSON object only. No markdown fences. No commentary.',
	'Schema:',
	'{',
	'  "searchQuery": string,       // short English technical query (symbols, APIs, behaviors)',
	'  "pathPrefixes": string[],    // optional relative prefixes e.g. ["src/","app/"]; empty if unsure',
	'  "preferCodeFiles": boolean,  // true when the answer likely lives in source code vs docs',
	'  "skipRetrieval": boolean     // true only for pure chitchat with no codebase need',
	'}',
	'Rules:',
	'- searchQuery MUST be English technical terms (not a translation of the greeting).',
	'- Do not invent paths; use pathPrefixes only when clearly implied.',
	'- Prefer code over README/docs when the user asks how the product works.',
].join('\n');

const USER_V1 = [
	'User message:',
	'"""',
	'{{userMessage}}',
	'"""',
	'Return the JSON filter now.',
].join('\n');

const SYSTEM_V1_COMPACT = [
	'Emit one JSON object only: {"searchQuery":string,"pathPrefixes":string[],"preferCodeFiles":boolean,"skipRetrieval":boolean}.',
	'searchQuery = English technical retrieval query. preferCodeFiles=true for how-it-works code questions. skipRetrieval=true only for chitchat.',
].join(' ');

export const CODEBASE_RETRIEVAL_COMPREHENSION_VARIANTS: readonly IDroxModelQuestionVariant[] = [
	{
		questionId: 'codebase.retrieval.comprehension',
		variantId: 'v1',
		language: 'en',
		intent: 'Rewrite user message into structured codebase retrieval filter',
		system: SYSTEM_V1,
		userTemplate: USER_V1,
	},
	{
		questionId: 'codebase.retrieval.comprehension',
		variantId: 'v1-compact',
		language: 'en',
		intent: 'Shorter comprehension prompt for small / fast models (SAV / auto-reg)',
		system: SYSTEM_V1_COMPACT,
		userTemplate: USER_V1,
	},
];
