/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * L2 Tool surface — thin wrapper tables (R7).
 * Restricts which *toggleable* tools reach the model (schema / executable).
 * Always-active tools stay available. Presentation (short schemas) = later if engine exposes it.
 * Wrappers read `getModule('L2')` only — no scoring here.
 */

import { DROX_ALWAYS_ACTIVE_TOOLS, DROX_TOGGLEABLE_TOOL_NAMES } from '../droxToolCatalog.js';
import { DroxRegulationL2Module, DroxRegulationModule } from './droxRegulationTypes.js';

/** Core = read/search + essential edits + shell. */
const CORE_TOOLS: readonly string[] = [
	'glob',
	'grep',
	'file_read',
	'file_edit',
	'file_write',
	'bash',
];

/** Standard = core + IDE analysis, notebooks, path ops, memory, codebase, plan exit. */
const STANDARD_TOOLS: readonly string[] = [
	...CORE_TOOLS,
	'notebook_edit',
	'delete_path',
	'copy_path',
	'lsp',
	'exit_plan_mode',
	'session_note',
	'memory_read',
	'memory_list',
	'session_compact',
	'session_search',
	'codebase_search',
];

const ALLOWED: Readonly<Record<DroxRegulationL2Module, ReadonlySet<string> | undefined>> = {
	core: new Set(CORE_TOOLS),
	standard: new Set(STANDARD_TOOLS),
	/** `undefined` = no extra L2 restriction (full toggleable catalogue). */
	full: undefined,
};

/** Narrow `getModule('L2')` (union) to an L2 module; unknown → standard. */
export function asDroxRegulationL2Module(module: DroxRegulationModule): DroxRegulationL2Module {
	switch (module) {
		case 'core':
		case 'standard':
		case 'full':
			return module;
		default:
			return 'standard';
	}
}

export function droxRegulationL2AllowedToggleableTools(
	module: DroxRegulationL2Module,
): ReadonlySet<string> | undefined {
	return ALLOWED[module];
}

/**
 * Merge user-disabled tools with L2 extras (toggleable tools outside the allowlist).
 * Always-active tools are never added to the disabled list.
 */
export function applyDroxRegulationL2DisabledTools(
	module: DroxRegulationL2Module,
	alreadyDisabled: readonly string[],
): string[] {
	const allowed = ALLOWED[module];
	if (!allowed) {
		return [...alreadyDisabled];
	}
	const out = new Set(alreadyDisabled);
	const always = new Set<string>(DROX_ALWAYS_ACTIVE_TOOLS);
	for (const name of DROX_TOGGLEABLE_TOOL_NAMES) {
		if (always.has(name) || allowed.has(name)) {
			continue;
		}
		out.add(name);
	}
	return [...out].sort();
}

/** Filter client executable tool names by L2 allowlist (unknown names kept). */
export function applyDroxRegulationL2ExecutableTools(
	module: DroxRegulationL2Module,
	names: readonly string[],
): string[] {
	const allowed = ALLOWED[module];
	if (!allowed) {
		return [...names];
	}
	const toggleable = new Set(DROX_TOGGLEABLE_TOOL_NAMES);
	return names.filter(n => !toggleable.has(n) || allowed.has(n));
}
