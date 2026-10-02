/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDroxRegulationHistory } from './droxRegulationHistory.js';
import { IDroxRegulationProbe } from './droxRegulationProbe.js';
import { IDroxRegulationRunSignals } from './droxRegulationRunSignals.js';
import { IDroxRegulationSurface } from './droxRegulationSurface.js';

export interface IDroxRegulationRunRecord {
	readonly modelKey: string;
	readonly signals: IDroxRegulationRunSignals;
	readonly sessionId?: string;
	readonly runId?: string;
	readonly promptExcerpt: string;
	readonly workspaceRootFsPath?: string;
	readonly issueDetail?: string;
}

/** Single DI token — one instance for probe, history, surface (R1+). */
export const IDroxRegulationService = createDecorator<IDroxRegulationService>('droxRegulationService');

export interface IDroxRegulationService extends IDroxRegulationProbe, IDroxRegulationHistory, IDroxRegulationSurface {
	/** Score only (tests / callers without history meta). */
	recordRunSignals(modelKey: string, signals: IDroxRegulationRunSignals): void;
	/** Score + history entry (persists when workspace root is set). */
	recordRun(record: IDroxRegulationRunRecord): void;
	/** Load history from `.drox/regulation/history.json` for a workspace (idempotent). */
	ensureHistoryLoaded(workspaceRootFsPath: string): Promise<void>;
	/** Await pending history writes. */
	whenHistoryIdle(): Promise<void>;
}
