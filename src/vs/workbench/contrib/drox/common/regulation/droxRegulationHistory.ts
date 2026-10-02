/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDroxRegulationHistoryEntry } from './droxRegulationTypes.js';

/**
 * Per-prompt/run history for the regulation console.
 * R0: stub; R2: persist under `.drox/regulation/`.
 */
export const IDroxRegulationHistory = createDecorator<IDroxRegulationHistory>('droxRegulationHistory');

export interface IDroxRegulationHistory {
	readonly _serviceBrand: undefined;
	readonly onDidChangeHistory: Event<void>;
	list(opts?: { readonly modelKey?: string; readonly limit?: number }): readonly IDroxRegulationHistoryEntry[];
}
