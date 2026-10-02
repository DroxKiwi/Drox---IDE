/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IDroxRegulationHistory } from './droxRegulationHistory.js';
import { IDroxRegulationProbe } from './droxRegulationProbe.js';
import { IDroxRegulationSurface } from './droxRegulationSurface.js';
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
 * R0 stub: defaults only. No scoring, no persistence, no run mutation.
 * Later steps flesh out probe / history / surface without changing this public shape.
 */
export class DroxRegulationService extends Disposable implements IDroxRegulationProbe, IDroxRegulationHistory, IDroxRegulationSurface {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeScores = this._register(new Emitter<void>());
	readonly onDidChangeScores = this._onDidChangeScores.event;

	private readonly _onDidChangeHistory = this._register(new Emitter<void>());
	readonly onDidChangeHistory = this._onDidChangeHistory.event;

	private readonly _onDidChangeSurface = this._register(new Emitter<void>());
	readonly onDidChangeSurface = this._onDidChangeSurface.event;

	private _surface: DroxRegulationSurfaceState = createDefaultRegulationSurfaceState();

	getScores(modelKey: string): IDroxRegulationScoreSnapshot {
		const at = Date.now();
		const levers = createEmptyLeverScores(at);
		return {
			modelKey: modelKey || 'unknown',
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
