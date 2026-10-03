/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * L1 Context budget — thin wrapper tables (R6).
 * Scales codebase inject + session-notes annex relative to current defaults.
 * Wrappers read `getModule('L1')` only — no scoring here.
 */

import { DroxRegulationL1Module, DroxRegulationModule } from './droxRegulationTypes.js';

export interface IDroxRegulationL1Budget {
	readonly module: DroxRegulationL1Module;
	/** Multiplier applied to configured/default inject maxChars. */
	readonly injectCharsFactor: number;
	/** Multiplier applied to default/force inject maxHits. */
	readonly injectHitsFactor: number;
	/**
	 * Max chars for session-notes system annex.
	 * `0` = omit notes; `undefined` = no extra truncate (full).
	 */
	readonly sessionNotesMaxChars: number | undefined;
}

const TABLE: Readonly<Record<DroxRegulationL1Module, Omit<IDroxRegulationL1Budget, 'module'>>> = {
	minimal: { injectCharsFactor: 0.3, injectHitsFactor: 0.4, sessionNotesMaxChars: 0 },
	compact: { injectCharsFactor: 0.6, injectHitsFactor: 0.65, sessionNotesMaxChars: 800 },
	standard: { injectCharsFactor: 1, injectHitsFactor: 1, sessionNotesMaxChars: undefined },
	rich: { injectCharsFactor: 2, injectHitsFactor: 1.5, sessionNotesMaxChars: undefined },
};

/** Narrow `getModule('L1')` (union) to an L1 module; unknown → standard. */
export function asDroxRegulationL1Module(module: DroxRegulationModule): DroxRegulationL1Module {
	switch (module) {
		case 'minimal':
		case 'compact':
		case 'standard':
		case 'rich':
			return module;
		default:
			return 'standard';
	}
}

export function droxRegulationL1Budget(module: DroxRegulationL1Module): IDroxRegulationL1Budget {
	const row = TABLE[module] ?? TABLE.standard;
	return { module, ...row };
}

export function applyDroxRegulationL1InjectBudget(
	module: DroxRegulationL1Module,
	base: { readonly maxChars: number; readonly maxHits: number },
): { readonly maxChars: number; readonly maxHits: number } {
	const b = droxRegulationL1Budget(module);
	return {
		maxChars: Math.max(400, Math.floor(base.maxChars * b.injectCharsFactor)),
		maxHits: Math.max(1, Math.round(base.maxHits * b.injectHitsFactor)),
	};
}

export function applyDroxRegulationL1SessionNotes(
	module: DroxRegulationL1Module,
	notes: string | undefined,
): string | undefined {
	const trimmed = notes?.trim();
	if (!trimmed) {
		return undefined;
	}
	const max = droxRegulationL1Budget(module).sessionNotesMaxChars;
	if (max === 0) {
		return undefined;
	}
	if (typeof max === 'number' && trimmed.length > max) {
		return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
	}
	return trimmed;
}
