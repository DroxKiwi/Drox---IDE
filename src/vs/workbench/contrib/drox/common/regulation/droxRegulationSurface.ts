/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import {
	DroxRegulationLeverId,
	DroxRegulationModule,
	DroxRegulationSurfaceState,
} from './droxRegulationTypes.js';

/**
 * Effective modules for wrappers (Auto / manual override).
 * R0: defaults only, no apply; R5+: UI state; R6+: wrappers read this.
 * Per-lever narrowing can be added later via helpers; keep one signature for DI.
 */
export const IDroxRegulationSurface = createDecorator<IDroxRegulationSurface>('droxRegulationSurface');

export interface IDroxRegulationSurface {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSurface: Event<void>;
	getState(): DroxRegulationSurfaceState;
	getModule(lever: DroxRegulationLeverId): DroxRegulationModule;
}
