/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	DROX_REGULATION_HISTORY_MAX_ENTRIES,
	droxRegulationReadHistory,
	droxRegulationWriteHistory,
} from './droxRegulationHistoryStore.js';
import { mergeRegulationRunIntoSnapshot } from './droxRegulationScoreAggregate.js';
import { scoreRegulationGlobal, scoreRegulationRun } from './droxRegulationScorer.js';
import { applyDroxRegulationAutoPolicy } from './droxRegulationAutoPolicy.js';
import { IDroxRegulationRunRecord, IDroxRegulationService } from './droxRegulationServiceContract.js';
import { IDroxRegulationRunSignals } from './droxRegulationRunSignals.js';
import {
	droxRegulationModulesFromSurface,
	droxRegulationReadSurface,
	droxRegulationWriteSurface,
	withLeverMode,
	withLeverModule,
} from './droxRegulationSurfaceStore.js';
import {
	createDefaultRegulationSurfaceState,
	createEmptyLeverScores,
	DroxRegulationLeverId,
	DroxRegulationLeverMode,
	DroxRegulationModule,
	DroxRegulationSurfaceState,
	IDroxRegulationHistoryEntry,
	IDroxRegulationScoreSnapshot,
} from './droxRegulationTypes.js';

/**
 * R11: scores + history + surface + Auto policy (note → module when mode=auto).
 * Wrappers = R6–R10.
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
	private _history: IDroxRegulationHistoryEntry[] = [];
	private _loadedWorkspace: string | undefined;
	private _persistChain: Promise<void> = Promise.resolve();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	recordRunSignals(modelKey: string, signals: IDroxRegulationRunSignals): void {
		this.recordRun({ modelKey, signals, promptExcerpt: '' });
	}

	recordRun(record: IDroxRegulationRunRecord): void {
		const key = record.modelKey.trim() || 'unknown';
		const run = scoreRegulationRun(record.signals);
		const next = mergeRegulationRunIntoSnapshot(this._scoresByModel.get(key), key, run);
		this._scoresByModel.set(key, next);
		this._onDidChangeScores.fire();

		const at = Date.now();
		const entry: IDroxRegulationHistoryEntry = {
			id: `reg_${generateUuid()}`,
			at,
			sessionId: record.sessionId,
			runId: record.runId,
			promptExcerpt: record.promptExcerpt || '',
			modelKey: key,
			workspaceRootFsPath: record.workspaceRootFsPath,
			modules: droxRegulationModulesFromSurface(this._surface),
			leverScores: {
				L1: run.L1,
				L2: run.L2,
				L3: run.L3,
				L4: run.L4,
				L5: run.L5,
			},
			globalScore: scoreRegulationGlobal(run),
			issue: record.signals.issue,
			issueDetail: record.issueDetail,
		};
		this._history = [...this._history, entry];
		if (this._history.length > DROX_REGULATION_HISTORY_MAX_ENTRIES) {
			this._history = this._history.slice(this._history.length - DROX_REGULATION_HISTORY_MAX_ENTRIES);
		}
		this._onDidChangeHistory.fire();

		// R11: after historizing modules used for this run, Auto may retarget next run.
		const applied = applyDroxRegulationAutoPolicy(this._surface, {
			L1: next.levers.L1.score,
			L2: next.levers.L2.score,
			L3: next.levers.L3.score,
			L4: next.levers.L4.score,
			L5: next.levers.L5.score,
		});
		if (applied !== this._surface) {
			this._surface = applied;
			this._onDidChangeSurface.fire();
			this._scheduleSurfacePersist();
		}

		const ws = record.workspaceRootFsPath?.trim();
		if (ws) {
			this._loadedWorkspace = ws;
			this._persistChain = this._persistChain.then(() => this._writeHistory(ws)).catch(err => {
				this.logService.warn('[Drox regulation] history persist failed', err);
			});
		}
	}

	async whenHistoryIdle(): Promise<void> {
		await this._persistChain;
	}

	async ensureHistoryLoaded(workspaceRootFsPath: string): Promise<void> {
		const ws = workspaceRootFsPath.trim();
		if (!ws || this._loadedWorkspace === ws) {
			return;
		}
		const [entries, surface] = await Promise.all([
			droxRegulationReadHistory(this.fileService, ws),
			droxRegulationReadSurface(this.fileService, ws),
		]);
		this._history = [...entries];
		this._surface = surface;
		this._loadedWorkspace = ws;
		this._rebuildScoresFromHistory();
		this._onDidChangeHistory.fire();
		this._onDidChangeScores.fire();
		this._onDidChangeSurface.fire();
	}

	/** Rehydrate in-memory aggregates from persisted history (reload / workspace switch). */
	private _rebuildScoresFromHistory(): void {
		this._scoresByModel.clear();
		for (const entry of this._history) {
			const key = entry.modelKey.trim() || 'unknown';
			const run = {
				L1: entry.leverScores.L1,
				L2: entry.leverScores.L2,
				L3: entry.leverScores.L3,
				L4: entry.leverScores.L4,
				L5: entry.leverScores.L5,
			};
			const next = mergeRegulationRunIntoSnapshot(this._scoresByModel.get(key), key, run, entry.at);
			this._scoresByModel.set(key, next);
		}
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

	list(opts?: { readonly modelKey?: string; readonly limit?: number }): readonly IDroxRegulationHistoryEntry[] {
		let rows = this._history;
		// Partition by loaded discussion root (ignore orphan / other-folder rows).
		if (this._loadedWorkspace) {
			const ws = this._loadedWorkspace;
			rows = rows.filter(e => !e.workspaceRootFsPath || e.workspaceRootFsPath === ws);
		}
		if (opts?.modelKey) {
			const mk = opts.modelKey.trim();
			rows = rows.filter(e => e.modelKey === mk);
		}
		const limit = opts?.limit;
		if (typeof limit === 'number' && limit >= 0 && rows.length > limit) {
			return rows.slice(rows.length - limit);
		}
		return rows;
	}

	getState(): DroxRegulationSurfaceState {
		return this._surface;
	}

	getModule(lever: DroxRegulationLeverId): DroxRegulationModule {
		return this._surface[lever].module;
	}

	setLeverMode(lever: DroxRegulationLeverId, mode: DroxRegulationLeverMode): void {
		if (this._surface[lever].mode === mode) {
			return;
		}
		this._surface = withLeverMode(this._surface, lever, mode);
		this._onDidChangeSurface.fire();
		this._scheduleSurfacePersist();
	}

	setLeverModule(lever: DroxRegulationLeverId, module: DroxRegulationModule): void {
		const next = withLeverModule(this._surface, lever, module);
		if (!next) {
			return;
		}
		if (next[lever].module === this._surface[lever].module && next[lever].mode === this._surface[lever].mode) {
			return;
		}
		this._surface = next;
		this._onDidChangeSurface.fire();
		this._scheduleSurfacePersist();
	}

	private _scheduleSurfacePersist(): void {
		const ws = this._loadedWorkspace;
		if (!ws) {
			return;
		}
		const snapshot = this._surface;
		this._persistChain = this._persistChain.then(() => droxRegulationWriteSurface(this.fileService, ws, snapshot)).catch(err => {
			this.logService.warn('[Drox regulation] surface persist failed', err);
		});
	}

	private async _writeHistory(workspaceRootFsPath: string): Promise<void> {
		await droxRegulationWriteHistory(this.fileService, workspaceRootFsPath, this._history);
	}
}
