/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDroxRegulationScoreSnapshot } from './droxRegulationTypes.js';

/**
 * Read-only probe: events → scores. Never mutates a run.
 * R0: stub; R1: real scorer.
 */
export const IDroxRegulationProbe = createDecorator<IDroxRegulationProbe>('droxRegulationProbe');

export interface IDroxRegulationProbe {
	readonly _serviceBrand: undefined;
	readonly onDidChangeScores: Event<void>;
	/** Latest snapshot for a model key (`provider::modelId`), or empty defaults. */
	getScores(modelKey: string): IDroxRegulationScoreSnapshot;
}
