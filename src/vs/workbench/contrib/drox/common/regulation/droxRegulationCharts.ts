/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	DroxRegulationRunIssue,
	IDroxRegulationHistoryEntry,
} from './droxRegulationTypes.js';

export interface IDroxRegulationIssueBreakdown {
	readonly ok: number;
	readonly error: number;
	readonly cancel: number;
	readonly loop: number;
	readonly total: number;
}

/** Chronological global scores (oldest → newest), capped. */
export function droxRegulationGlobalScoreSeries(
	history: readonly IDroxRegulationHistoryEntry[],
	maxPoints = 40,
): readonly number[] {
	const sorted = [...history].sort((a, b) => a.at - b.at);
	const slice = sorted.length > maxPoints ? sorted.slice(sorted.length - maxPoints) : sorted;
	return slice.map(e => e.globalScore);
}

export function droxRegulationIssueBreakdown(
	history: readonly IDroxRegulationHistoryEntry[],
): IDroxRegulationIssueBreakdown {
	let ok = 0;
	let error = 0;
	let cancel = 0;
	let loop = 0;
	for (const e of history) {
		switch (e.issue as DroxRegulationRunIssue) {
			case 'ok': ok++; break;
			case 'error': error++; break;
			case 'cancel': cancel++; break;
			case 'loop': loop++; break;
		}
	}
	return { ok, error, cancel, loop, total: history.length };
}

/** SVG polyline points for a 0–100 series in a width×height box (padding 2). */
export function droxRegulationSparklinePoints(
	series: readonly number[],
	width: number,
	height: number,
	pad = 2,
): string {
	if (series.length === 0) {
		return '';
	}
	const innerW = Math.max(1, width - pad * 2);
	const innerH = Math.max(1, height - pad * 2);
	const n = series.length;
	const pts: string[] = [];
	for (let i = 0; i < n; i++) {
		const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
		const y = pad + innerH - (Math.max(0, Math.min(100, series[i])) / 100) * innerH;
		pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
	}
	return pts.join(' ');
}
