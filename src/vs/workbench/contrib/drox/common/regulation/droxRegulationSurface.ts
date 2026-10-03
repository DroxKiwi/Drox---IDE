/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import {
	DroxRegulationLeverId,
	DroxRegulationLeverMode,
	DroxRegulationModule,
	DroxRegulationSurfaceState,
} from './droxRegulationTypes.js';

/**
 * Effective modules for wrappers (Auto / manual override).
 * R5: UI state persisted; R6+: wrappers read getModule; R11: Auto policy writes modules.
 */
export const IDroxRegulationSurface = createDecorator<IDroxRegulationSurface>('droxRegulationSurface');

export interface IDroxRegulationSurface {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSurface: Event<void>;
	getState(): DroxRegulationSurfaceState;
	getModule(lever: DroxRegulationLeverId): DroxRegulationModule;
	setLeverMode(lever: DroxRegulationLeverId, mode: DroxRegulationLeverMode): void;
	/** Sets module and forces mode=manual (override freezes Auto on that lever). */
	setLeverModule(lever: DroxRegulationLeverId, module: DroxRegulationModule): void;
}
