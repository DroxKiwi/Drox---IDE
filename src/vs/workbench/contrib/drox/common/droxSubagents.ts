/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DroxRegulationL2Module } from './regulation/droxRegulationTypes.js';

/**
 * Composition rule (v1): master setting ON **and** L2 ∈ { standard, full }.
 * Core never exposes Explore even if the user enabled the kill-switch.
 */
export function droxSubagentsEnabledForRun(
	masterEnabled: boolean,
	l2Module: DroxRegulationL2Module,
): boolean {
	return masterEnabled === true && (l2Module === 'standard' || l2Module === 'full');
}
