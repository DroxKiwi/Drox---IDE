/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * L3 Directive density — thin wrapper tables (R8).
 * Injects a short English system annex (tone / anti-rumination).
 * Wrappers read `getModule('L3')` only — no scoring here.
 */

import { DroxRegulationL3Module, DroxRegulationModule } from './droxRegulationTypes.js';

const ANNEX: Readonly<Record<DroxRegulationL3Module, string | undefined>> = {
	/** Soft: no extra directive (engine defaults only). */
	'laissez-faire': undefined,
	/** Default: light efficiency nudge + Explore at plan step kickoff when available. */
	guided:
		'Work efficiently: prefer tools over long speculation. When the next step is clear, take it. Keep narration brief. If the `task` (Explore) tool is available and the search span is large or unfamiliar, prefer `todo_write` then `task`/`explore` at plan step kickoff instead of many parent glob/grep/file_read rounds; for needle lookups use direct tools.',
	/** Strong anti-rumination + same Explore-at-kickoff bias. */
	assertive:
		'Anti-rumination mode: do not narrate at length before acting. For simple lookups or edits, call the tool immediately. Avoid multi-paragraph plans when one tool call suffices. Prefer the shortest path to the user goal. When `task`/Explore is available, use it at plan step kickoff for broad or deep codebase searches (after mounting/updating the plan when scope splits); never use it for a single known file or symbol.',
};

/** Narrow `getModule('L3')` (union) to an L3 module; unknown → guided. */
export function asDroxRegulationL3Module(module: DroxRegulationModule): DroxRegulationL3Module {
	switch (module) {
		case 'laissez-faire':
		case 'guided':
		case 'assertive':
			return module;
		default:
			return 'guided';
	}
}

export function droxRegulationL3DirectiveAnnex(module: DroxRegulationL3Module): string | undefined {
	return ANNEX[module];
}

/** Prepend L3 annex to the system supplement when present. */
export function applyDroxRegulationL3Directive(
	module: DroxRegulationL3Module,
	system: string | undefined,
): string | undefined {
	const annex = droxRegulationL3DirectiveAnnex(module);
	const body = system?.trim();
	if (!annex) {
		return body || undefined;
	}
	if (!body) {
		return annex;
	}
	return `${annex}\n\n${body}`;
}
