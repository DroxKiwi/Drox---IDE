/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * L2 Context-load — soft Explore fan-out caps (V1).
 * Derives RPC `contextLoad` from L2 only. Engine scores after `glob` and may
 * inject a one-shot system nudge; never a hard gate.
 */

import { DroxRegulationL2Module, DroxRegulationModule } from './droxRegulationTypes.js';
import { asDroxRegulationL2Module } from './droxRegulationL2Surface.js';

export interface IDroxRegulationL2ContextLoad {
	readonly module: DroxRegulationL2Module;
	/** When false, engine must not inject a Context-load nudge. */
	readonly inject: boolean;
	/** Soft ceiling on recommended Explore (`task`) count. */
	readonly maxRecommendedN: number;
	/** `load = files + ceil(kb / kbDivisor)`. */
	readonly kbDivisor: number;
}

const TABLE: Readonly<Record<DroxRegulationL2Module, Omit<IDroxRegulationL2ContextLoad, 'module'>>> = {
	core: { inject: false, maxRecommendedN: 0, kbDivisor: 40 },
	standard: { inject: true, maxRecommendedN: 3, kbDivisor: 40 },
	full: { inject: true, maxRecommendedN: 4, kbDivisor: 40 },
};

export function droxRegulationL2ContextLoad(
	module: DroxRegulationL2Module,
): IDroxRegulationL2ContextLoad {
	const row = TABLE[module] ?? TABLE.standard;
	return { module, ...row };
}

/** Wire shape for `agent.run` (`contextLoad` camelCase). */
export interface IDroxAgentRunContextLoadParams {
	readonly inject: boolean;
	readonly maxRecommendedN: number;
	readonly kbDivisor: number;
}

/**
 * Build RPC caps when L2 allows inject and Explore (`task`) is enabled for the run.
 * Returns `undefined` when the engine should keep default (no inject).
 */
export function buildDroxAgentRunContextLoadParams(
	l2Module: DroxRegulationModule,
	subagentsEnabledForRun: boolean,
): IDroxAgentRunContextLoadParams | undefined {
	const l2 = asDroxRegulationL2Module(l2Module);
	const policy = droxRegulationL2ContextLoad(l2);
	if (!policy.inject || !subagentsEnabledForRun || policy.maxRecommendedN <= 0) {
		return undefined;
	}
	return {
		inject: true,
		maxRecommendedN: policy.maxRecommendedN,
		kbDivisor: policy.kbDivisor,
	};
}
