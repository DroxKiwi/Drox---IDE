/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * R11 Auto policy — map lever scores (0–100) → recommended modules.
 * Apply only when surface mode === 'auto' (manual override is frozen).
 */

import {
	DROX_REGULATION_LEVER_IDS,
	DroxRegulationLeverId,
	DroxRegulationModule,
	DroxRegulationSurfaceState,
} from './droxRegulationTypes.js';

/**
 * Recommend a module from a lever score.
 * High score → lighter cognitive pressure / richer offer when safe.
 * Low score → tighten (less context, fewer tools, more directive/strict/retrieval).
 */
export function recommendDroxRegulationModule(
	lever: DroxRegulationLeverId,
	score: number,
): DroxRegulationModule {
	const s = Number.isFinite(score) ? score : 50;
	switch (lever) {
		case 'L1':
			if (s >= 80) {
				return 'rich';
			}
			if (s >= 55) {
				return 'standard';
			}
			if (s >= 35) {
				return 'compact';
			}
			return 'minimal';
		case 'L2':
			if (s >= 75) {
				return 'full';
			}
			if (s >= 45) {
				return 'standard';
			}
			return 'core';
		case 'L3':
			if (s >= 75) {
				return 'laissez-faire';
			}
			if (s >= 45) {
				return 'guided';
			}
			return 'assertive';
		case 'L4':
			if (s >= 75) {
				return 'soft';
			}
			if (s >= 45) {
				return 'normal';
			}
			return 'strict';
		case 'L5':
			if (s >= 75) {
				return 'passive';
			}
			if (s >= 45) {
				return 'nudge';
			}
			return 'aggressive';
	}
}

/**
 * For each lever in `auto` mode, set module from score.
 * Manual levers unchanged. Returns same reference if nothing changed.
 */
export function applyDroxRegulationAutoPolicy(
	surface: DroxRegulationSurfaceState,
	leverScores: Readonly<Record<DroxRegulationLeverId, number>>,
): DroxRegulationSurfaceState {
	let next: DroxRegulationSurfaceState | undefined;
	for (const lever of DROX_REGULATION_LEVER_IDS) {
		if (surface[lever].mode !== 'auto') {
			continue;
		}
		const recommended = recommendDroxRegulationModule(lever, leverScores[lever]);
		if (recommended === surface[lever].module) {
			continue;
		}
		const base = next ?? surface;
		next = {
			...base,
			[lever]: {
				lever,
				mode: 'auto',
				module: recommended,
			},
		};
	}
	return next ?? surface;
}
