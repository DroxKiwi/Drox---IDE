/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * L5 Retrieval posture — thin wrapper tables (R10).
 * Scales pressure of the @Codebase / retrieval hint (not engine capabilities).
 * Wrappers read `getModule('L5')` only — no scoring here.
 */

import { DROX_CODEBASE_RETRIEVAL_HINT } from '../codebase/droxCodebaseContextPack.js';
import { DroxRegulationL5Module, DroxRegulationModule } from './droxRegulationTypes.js';

const AGGRESSIVE_HINT =
	'Retrieval required for code/workspace questions: call `codebase_search` (or use injected `@Codebase` context) before guessing paths or APIs. Prefer the local index over speculative answers. Use `grep` only for exact symbol/string literals. Do not confuse with `session_search` (long-term chat memory).';

const HINT: Readonly<Record<DroxRegulationL5Module, string | undefined>> = {
	/** Soft: no retrieval pressure annex. */
	passive: undefined,
	/** Default: current CB4 soft hint. */
	nudge: DROX_CODEBASE_RETRIEVAL_HINT,
	/** Strong: require retrieval before guessing. */
	aggressive: AGGRESSIVE_HINT,
};

/** Narrow `getModule('L5')` (union) to an L5 module; unknown → nudge. */
export function asDroxRegulationL5Module(module: DroxRegulationModule): DroxRegulationL5Module {
	switch (module) {
		case 'passive':
		case 'nudge':
		case 'aggressive':
			return module;
		default:
			return 'nudge';
	}
}

export function droxRegulationL5RetrievalHint(module: DroxRegulationL5Module): string | undefined {
	return HINT[module];
}
