/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * L4 Protocol strictness — thin wrapper tables (R9).
 * Injects a short English system annex (todo/phase reminders).
 * Engine hard-gates still apply; this only adjusts reminder density.
 * Wrappers read `getModule('L4')` only — no scoring here.
 */

import { DroxRegulationL4Module, DroxRegulationModule } from './droxRegulationTypes.js';

const ANNEX: Readonly<Record<DroxRegulationL4Module, string | undefined>> = {
	/** Soft: no extra reminder (engine gates only). */
	soft: undefined,
	/** Default: light protocol reminder. */
	normal:
		'Protocol: before any mutating tool (`file_edit`, `file_write`, `notebook_edit`, `delete_path`, mutating bash), call `todo_write` with at least one item in this run. Close todos before `[phase: done]`.',
	/** Strict: phases + todos + testing reminder. */
	strict:
		'Strict protocol: (1) Use honest `[phase: …]` markers when structuring non-trivial work. (2) Before ANY mutation (`file_edit`, `file_write`, `notebook_edit`, `delete_path`, mutating bash), you MUST have called `todo_write` this run. (3) Update todos as you go; mark all completed/cancelled before `[phase: done]`. (4) Prefer `[phase: testing]` when verifying changes. Do not emit `[phase: done]` with open todos.',
};

/** Narrow `getModule('L4')` (union) to an L4 module; unknown → normal. */
export function asDroxRegulationL4Module(module: DroxRegulationModule): DroxRegulationL4Module {
	switch (module) {
		case 'soft':
		case 'normal':
		case 'strict':
			return module;
		default:
			return 'normal';
	}
}

export function droxRegulationL4ProtocolAnnex(module: DroxRegulationL4Module): string | undefined {
	return ANNEX[module];
}

/** Prepend L4 annex to the system supplement when present. */
export function applyDroxRegulationL4Protocol(
	module: DroxRegulationL4Module,
	system: string | undefined,
): string | undefined {
	const annex = droxRegulationL4ProtocolAnnex(module);
	const body = system?.trim();
	if (!annex) {
		return body || undefined;
	}
	if (!body) {
		return annex;
	}
	return `${annex}\n\n${body}`;
}
