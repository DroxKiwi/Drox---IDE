/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Versionable model questions (always English).
 * Used for comprehension → structured filter — never NL heuristics in code.
 * Variants feed SAV / 1.5.22 auto-regulation later.
 */

/** Stable question ids — add here when introducing a new ask. */
export type DroxModelQuestionId =
	| 'codebase.retrieval.comprehension'
	| 'explore.mission.decompose';

export type DroxModelQuestionLanguage = 'en';

export interface IDroxModelQuestionVariant {
	readonly questionId: DroxModelQuestionId;
	/** e.g. `v1`, `v1-compact`, `v2` — selectable per model later. */
	readonly variantId: string;
	readonly language: DroxModelQuestionLanguage;
	readonly system: string;
	/** User turn; must contain `{{userMessage}}`. */
	readonly userTemplate: string;
	/** Human note for editors / SAV. */
	readonly intent: string;
}

export interface IDroxModelQuestionResolveOpts {
	readonly modelId?: string;
	/** Explicit variant override (settings / auto-reg). */
	readonly variantId?: string;
}

/** Structured filter after codebase comprehension (mechanical apply only). */
export interface IDroxCodebaseRetrievalFilter {
	readonly searchQuery: string;
	readonly pathPrefixes: readonly string[];
	readonly preferCodeFiles: boolean;
	readonly skipRetrieval: boolean;
	readonly questionId: DroxModelQuestionId;
	readonly variantId: string;
}

/** One focused Explore mission from decompose ask. */
export interface IDroxExploreMission {
	readonly title: string;
	readonly scope: string;
	readonly mustReturn: readonly string[];
	readonly thoroughness: 'quick' | 'medium' | 'very thorough';
}

/** Session-master decompose plan (mechanical annex only — no NL heuristics). */
export interface IDroxExploreMissionPlan {
	readonly needsExplore: boolean;
	readonly missionCount: number;
	readonly missions: readonly IDroxExploreMission[];
	readonly questionId: DroxModelQuestionId;
	readonly variantId: string;
}
