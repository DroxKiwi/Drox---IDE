/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scorer v0 — formulas documented here (PLAN-MODEL-AUTO-REGULATION §4).
 * Each lever returns 0–100 for one run (100 = no stress on that axis).
 */

import { DroxRegulationLeverId, DROX_REGULATION_LEVER_IDS } from './droxRegulationTypes.js';
import { IDroxRegulationRunSignals } from './droxRegulationRunSignals.js';

export type DroxRegulationRunScores = Readonly<Record<DroxRegulationLeverId, number>>;

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** L1 — context budget: heavy ctx + schema/format loss + cancel mid-run. */
export function scoreRegulationL1(s: IDroxRegulationRunSignals): number {
	let score = 100;
	score -= s.schemaErrorContinueCount * 14;
	score -= s.textToolMarkerStreak * 10;
	if (s.contextTokens > 48_000) {
		score -= 18;
	} else if (s.contextTokens > 24_000) {
		score -= 10;
	} else if (s.contextTokens > 12_000) {
		score -= 4;
	}
	if (s.issue === 'cancel') {
		score -= 12;
	}
	if (s.issue === 'error' && s.schemaErrorContinueCount > 0) {
		score -= 8;
	}
	return clamp(score);
}

/** L2 — tool surface: bad tools / schema retries / loops. */
export function scoreRegulationL2(s: IDroxRegulationRunSignals): number {
	let score = 100;
	score -= s.schemaErrorContinueCount * 16;
	score -= s.textToolMarkerStreak * 12;
	score -= Math.min(40, s.toolErrorCount * 8);
	if (s.issue === 'loop') {
		score -= 35;
	}
	if (s.issue === 'error' && s.toolErrorCount > 0) {
		score -= 10;
	}
	return clamp(score);
}

/** L3 — directive density: many LLM turns on trivial runs (proxy for rumination). */
export function scoreRegulationL3(s: IDroxRegulationRunSignals): number {
	let score = 100;
	if (s.greetingOnly && s.llmIterations > 2) {
		score -= 25;
	}
	if (s.llmIterations > 12) {
		score -= 20;
	} else if (s.llmIterations > 8) {
		score -= 12;
	} else if (s.llmIterations > 5) {
		score -= 5;
	}
	if (s.issue === 'loop') {
		score -= 15;
	}
	return clamp(score);
}

/** L4 — protocol: mutation intent without clean completion. */
export function scoreRegulationL4(s: IDroxRegulationRunSignals): number {
	let score = 100;
	if (s.expectsWorkspaceMutation) {
		if (s.issue === 'error') {
			score -= 22;
		}
		if (s.issue === 'cancel') {
			score -= 14;
		}
		if (s.toolErrorCount > 0) {
			score -= Math.min(24, s.toolErrorCount * 6);
		}
	}
	if (s.issue === 'loop') {
		score -= 12;
	}
	return clamp(score);
}

/** L5 — retrieval: code-ish runs without retrieval tools. */
export function scoreRegulationL5(s: IDroxRegulationRunSignals): number {
	let score = 100;
	const codeTask = s.expectsWorkspaceMutation && !s.greetingOnly;
	if (codeTask && !s.usedRetrievalTools) {
		score -= 18;
	}
	if (codeTask && !s.usedCodebaseSearch) {
		score -= 8;
	}
	if (s.issue === 'error' && codeTask && !s.usedRetrievalTools) {
		score -= 10;
	}
	return clamp(score);
}

export function scoreRegulationRun(signals: IDroxRegulationRunSignals): DroxRegulationRunScores {
	return {
		L1: scoreRegulationL1(signals),
		L2: scoreRegulationL2(signals),
		L3: scoreRegulationL3(signals),
		L4: scoreRegulationL4(signals),
		L5: scoreRegulationL5(signals),
	};
}

/** Global = unweighted mean of lever run scores. */
export function scoreRegulationGlobal(levers: DroxRegulationRunScores): number {
	let sum = 0;
	for (const id of DROX_REGULATION_LEVER_IDS) {
		sum += levers[id];
	}
	return clamp(sum / DROX_REGULATION_LEVER_IDS.length);
}
