/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDroxRegulationHistory } from './droxRegulationHistory.js';
import { IDroxRegulationProbe } from './droxRegulationProbe.js';
import { IDroxRegulationRunSignals } from './droxRegulationRunSignals.js';
import { IDroxRegulationSurface } from './droxRegulationSurface.js';

/** Single DI token — one instance for probe, history, surface (R1+). */
export const IDroxRegulationService = createDecorator<IDroxRegulationService>('droxRegulationService');

export interface IDroxRegulationService extends IDroxRegulationProbe, IDroxRegulationHistory, IDroxRegulationSurface {
	recordRunSignals(modelKey: string, signals: IDroxRegulationRunSignals): void;
}
