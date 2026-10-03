/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Score band for console colors (0–100). */
export type DroxRegulationScoreBand = 'good' | 'warn' | 'bad';

export function droxRegulationScoreBand(score: number): DroxRegulationScoreBand {
	if (score >= 75) {
		return 'good';
	}
	if (score >= 50) {
		return 'warn';
	}
	return 'bad';
}
