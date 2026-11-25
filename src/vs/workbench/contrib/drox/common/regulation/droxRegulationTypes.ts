/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Auto-regulation types (L1–L5).
 * Spec: docs/1.5/1.5.22/PLAN-MODEL-AUTO-REGULATION.md
 *
 * R0: types only — no scoring, no apply.
 */

/** Five cognitive-load levers exposed to the model (not engine capabilities). */
export type DroxRegulationLeverId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export const DROX_REGULATION_LEVER_IDS: readonly DroxRegulationLeverId[] = ['L1', 'L2', 'L3', 'L4', 'L5'];

export type DroxRegulationL1Module = 'minimal' | 'compact' | 'standard' | 'rich';
export type DroxRegulationL2Module = 'core' | 'standard' | 'full';
export type DroxRegulationL3Module = 'laissez-faire' | 'guided' | 'assertive';
export type DroxRegulationL4Module = 'soft' | 'normal' | 'strict';
export type DroxRegulationL5Module = 'passive' | 'nudge' | 'aggressive';

export type DroxRegulationModule =
	| DroxRegulationL1Module
	| DroxRegulationL2Module
	| DroxRegulationL3Module
	| DroxRegulationL4Module
	| DroxRegulationL5Module;

export type DroxRegulationModulesByLever = {
	readonly L1: DroxRegulationL1Module;
	readonly L2: DroxRegulationL2Module;
	readonly L3: DroxRegulationL3Module;
	readonly L4: DroxRegulationL4Module;
	readonly L5: DroxRegulationL5Module;
};

/** Default modules = current engine behaviour (parity when Auto OFF). */
export const DROX_REGULATION_DEFAULT_MODULES: DroxRegulationModulesByLever = {
	L1: 'standard',
	L2: 'standard',
	L3: 'guided',
	L4: 'normal',
	L5: 'nudge',
};

export const DROX_REGULATION_LEVER_LABELS: Readonly<Record<DroxRegulationLeverId, string>> = {
	L1: 'Context budget',
	L2: 'Tool surface',
	L3: 'Directive density',
	L4: 'Protocol strictness',
	L5: 'Retrieval posture',
};

export const DROX_REGULATION_MODULES_FOR_LEVER: {
	readonly L1: readonly DroxRegulationL1Module[];
	readonly L2: readonly DroxRegulationL2Module[];
	readonly L3: readonly DroxRegulationL3Module[];
	readonly L4: readonly DroxRegulationL4Module[];
	readonly L5: readonly DroxRegulationL5Module[];
} = {
	L1: ['minimal', 'compact', 'standard', 'rich'],
	L2: ['core', 'standard', 'full'],
	L3: ['laissez-faire', 'guided', 'assertive'],
	L4: ['soft', 'normal', 'strict'],
	L5: ['passive', 'nudge', 'aggressive'],
};

/** 0–100 score for one lever. */
export interface IDroxRegulationLeverScore {
	readonly lever: DroxRegulationLeverId;
	readonly score: number;
	readonly samples: number;
	readonly updatedAt: number;
}

export interface IDroxRegulationScoreSnapshot {
	readonly modelKey: string;
	readonly levers: Readonly<Record<DroxRegulationLeverId, IDroxRegulationLeverScore>>;
	readonly globalScore: number;
	readonly samples: number;
	readonly updatedAt: number;
}

export type DroxRegulationRunIssue = 'ok' | 'error' | 'cancel' | 'loop';

/** One historized prompt/run (R2 will persist). */
export interface IDroxRegulationHistoryEntry {
	readonly id: string;
	readonly at: number;
	readonly sessionId?: string;
	readonly runId?: string;
	readonly promptExcerpt: string;
	readonly modelKey: string;
	readonly workspaceRootFsPath?: string;
	readonly modules: DroxRegulationModulesByLever;
	readonly leverScores: Readonly<Record<DroxRegulationLeverId, number>>;
	readonly globalScore: number;
	readonly issue: DroxRegulationRunIssue;
	readonly issueDetail?: string;
}

export type DroxRegulationLeverMode = 'auto' | 'manual';

export interface IDroxRegulationLeverState {
	readonly lever: DroxRegulationLeverId;
	readonly mode: DroxRegulationLeverMode;
	/** Effective module (manual pick or last Auto output / default). */
	readonly module: DroxRegulationModule;
}

export type DroxRegulationSurfaceState = Readonly<Record<DroxRegulationLeverId, IDroxRegulationLeverState>>;

export function createDefaultRegulationSurfaceState(): DroxRegulationSurfaceState {
	const out = {} as Record<DroxRegulationLeverId, IDroxRegulationLeverState>;
	for (const lever of DROX_REGULATION_LEVER_IDS) {
		out[lever] = {
			lever,
			mode: 'manual',
			module: DROX_REGULATION_DEFAULT_MODULES[lever],
		};
	}
	return out;
}

export function createEmptyLeverScores(at: number = Date.now()): Readonly<Record<DroxRegulationLeverId, IDroxRegulationLeverScore>> {
	const out = {} as Record<DroxRegulationLeverId, IDroxRegulationLeverScore>;
	for (const lever of DROX_REGULATION_LEVER_IDS) {
		out[lever] = { lever, score: 50, samples: 0, updatedAt: at };
	}
	return out;
}

export function droxRegulationModelKey(provider: string, modelId: string): string {
	return `${provider.trim().toLowerCase()}::${modelId.trim()}`;
}
