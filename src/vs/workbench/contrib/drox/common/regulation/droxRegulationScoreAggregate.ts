/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	DroxRegulationLeverId,
	DROX_REGULATION_LEVER_IDS,
	IDroxRegulationLeverScore,
	IDroxRegulationScoreSnapshot,
} from './droxRegulationTypes.js';
import { DroxRegulationRunScores, scoreRegulationGlobal } from './droxRegulationScorer.js';

export function mergeRegulationRunIntoSnapshot(
	prev: IDroxRegulationScoreSnapshot | undefined,
	modelKey: string,
	run: DroxRegulationRunScores,
	at: number = Date.now(),
): IDroxRegulationScoreSnapshot {
	const samples = (prev?.samples ?? 0) + 1;
	const levers = {} as Record<DroxRegulationLeverId, IDroxRegulationLeverScore>;
	for (const lever of DROX_REGULATION_LEVER_IDS) {
		const old = prev?.levers[lever];
		const oldScore = old?.score ?? 50;
		const oldSamples = old?.samples ?? 0;
		const newSamples = oldSamples + 1;
		const score = (oldScore * oldSamples + run[lever]) / newSamples;
		levers[lever] = {
			lever,
			score: Math.round(score * 10) / 10,
			samples: newSamples,
			updatedAt: at,
		};
	}
	const globalScore = scoreRegulationGlobal({
		L1: levers.L1.score,
		L2: levers.L2.score,
		L3: levers.L3.score,
		L4: levers.L4.score,
		L5: levers.L5.score,
	});
	return {
		modelKey,
		levers,
		globalScore,
		samples,
		updatedAt: at,
	};
}
