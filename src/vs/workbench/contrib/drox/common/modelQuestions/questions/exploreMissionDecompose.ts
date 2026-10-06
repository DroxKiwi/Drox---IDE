/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxModelQuestionVariant } from '../droxModelQuestionTypes.js';

/**
 * Session-master decompose ask before Explore fan-out.
 * Output MUST be a single JSON object (no markdown):
 * {
 *   "needsExplore": boolean,
 *   "missionCount": number,
 *   "missions": [{ "title": string, "scope": string, "mustReturn": string[], "thoroughness": string }]
 * }
 */
const SYSTEM_V1 = [
	'You are helping a coding agent act as a **session master** for read-only Explore sub-agents.',
	'The user message is the locked objective. Decide whether Explore is needed and how to split work.',
	'Reply with ONE JSON object only. No markdown fences. No commentary.',
	'Schema:',
	'{',
	'  "needsExplore": boolean,   // false only for needles / 1–2 known paths / pure chitchat',
	'  "missionCount": number,    // integer 1–4 when needsExplore; 0 when false',
	'  "missions": [              // length MUST equal missionCount when needsExplore',
	'    {',
	'      "title": string,       // ≤8 words, concrete UI label',
	'      "scope": string,       // paths / question for THAT mission only',
	'      "mustReturn": string[], // acceptance criteria the parent still needs from this child',
	'      "thoroughness": string // "quick" | "medium" | "very thorough"',
	'    }',
	'  ]',
	'}',
	'Rules:',
	'- Prefer missionCount 2–4 when the objective spans multiple subtrees or concerns.',
	'- One mega-mission that packs the whole tree is wrong — split.',
	'- mustReturn must list concrete facts/sections (not vague "summary").',
	'- Titles never include engine meta ("sub-agent does not see chat").',
].join('\n');

const USER_V1 = [
	'User objective:',
	'"""',
	'{{userMessage}}',
	'"""',
	'Return the JSON decompose plan now.',
].join('\n');

const SYSTEM_V1_COMPACT = [
	'Emit one JSON object only: {"needsExplore":boolean,"missionCount":number,"missions":[{"title":string,"scope":string,"mustReturn":string[],"thoroughness":string}]}.',
	'needsExplore=false only for needles/chitchat. Prefer 2–4 focused missions; mustReturn = acceptance criteria for the parent.',
].join(' ');

export const EXPLORE_MISSION_DECOMPOSE_VARIANTS: readonly IDroxModelQuestionVariant[] = [
	{
		questionId: 'explore.mission.decompose',
		variantId: 'v1',
		language: 'en',
		intent: 'Decompose user objective into focused Explore missions (session master)',
		system: SYSTEM_V1,
		userTemplate: USER_V1,
	},
	{
		questionId: 'explore.mission.decompose',
		variantId: 'v1-compact',
		language: 'en',
		intent: 'Shorter decompose prompt for small / fast models',
		system: SYSTEM_V1_COMPACT,
		userTemplate: USER_V1,
	},
];
