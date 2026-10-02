/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mergeRegulationRunIntoSnapshot } from './droxRegulationScoreAggregate.js';
import { scoreRegulationRun } from './droxRegulationScorer.js';
import { IDroxRegulationService } from './droxRegulationServiceContract.js';
import { IDroxRegulationRunSignals } from './droxRegulationRunSignals.js';
import {
	createDefaultRegulationSurfaceState,
	createEmptyLeverScores,
	DroxRegulationLeverId,
	DroxRegulationModule,
	DroxRegulationSurfaceState,
	IDroxRegulationHistoryEntry,
	IDroxRegulationScoreSnapshot,
} from './droxRegulationTypes.js';

/**
 * R1: in-memory scorer per modelKey. History persist = R2. Surface = defaults until R5.
 */
export class DroxRegulationService extends Disposable implements IDroxRegulationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeScores = this._register(new Emitter<void>());
	readonly onDidChangeScores = this._onDidChangeScores.event;

	private readonly _onDidChangeHistory = this._register(new Emitter<void>());
	readonly onDidChangeHistory = this._onDidChangeHistory.event;

	private readonly _onDidChangeSurface = this._register(new Emitter<void>());
	readonly onDidChangeSurface = this._onDidChangeSurface.event;

	private _surface: DroxRegulationSurfaceState = createDefaultRegulationSurfaceState();
	private readonly _scoresByModel = new Map<string, IDroxRegulationScoreSnapshot>();

	recordRunSignals(modelKey: string, signals: IDroxRegulationRunSignals): void {
		const key = modelKey.trim() || 'unknown';
		const run = scoreRegulationRun(signals);
		const next = mergeRegulationRunIntoSnapshot(this._scoresByModel.get(key), key, run);
		this._scoresByModel.set(key, next);
		this._onDidChangeScores.fire();
	}

	getScores(modelKey: string): IDroxRegulationScoreSnapshot {
		const key = modelKey.trim() || 'unknown';
		const stored = this._scoresByModel.get(key);
		if (stored) {
			return stored;
		}
		const at = Date.now();
		const levers = createEmptyLeverScores(at);
		return {
			modelKey: key,
			levers,
			globalScore: 50,
			samples: 0,
			updatedAt: at,
		};
	}

	list(_opts?: { readonly modelKey?: string; readonly limit?: number }): readonly IDroxRegulationHistoryEntry[] {
		return [];
	}

	getState(): DroxRegulationSurfaceState {
		return this._surface;
	}

	getModule(lever: DroxRegulationLeverId): DroxRegulationModule {
		return this._surface[lever].module;
	}
}
