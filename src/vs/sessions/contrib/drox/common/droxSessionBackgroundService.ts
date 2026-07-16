/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISession } from '../../../services/sessions/common/session.js';

export const IDroxSessionBackgroundService = createDecorator<IDroxSessionBackgroundService>('droxSessionBackgroundService');

export const DROX_SKIP_BACKGROUND_SWITCH_CONFIRM_KEY = 'drox.sessions.skipBackgroundSwitchConfirm';

/** In-memory layout snapshot for a background-persistent session (window lifetime only). */
export interface IDroxSessionLayoutSnapshot {
	readonly panelVisible: boolean;
	readonly auxiliaryBarVisible: boolean;
	readonly auxiliaryBarActiveViewContainerId: string | undefined;
	readonly editorWorkingSet?: IEditorWorkingSet;
}

export interface IDroxSessionDashboardSignals {
	readonly shellActive: boolean;
	readonly modelActive: boolean;
	readonly gitOperationActive: boolean;
	readonly needsInput: boolean;
	readonly backgroundPersistent: boolean;
}

export interface IDroxSessionResourceMetricsView {
	readonly cpuPercent: number;
	readonly ramPercent: number;
	readonly diskPercent: number;
	readonly downloadPercent: number;
	readonly uploadPercent: number;
	readonly cpuHistory: readonly number[];
	readonly ramHistory: readonly number[];
	readonly diskHistory: readonly number[];
	readonly downloadHistory: readonly number[];
	readonly uploadHistory: readonly number[];
}

export interface IDroxSessionBackgroundService {
	readonly _serviceBrand: undefined;

	readonly persistentSessionIds: IObservable<ReadonlySet<string>>;

	isPersistent(sessionId: string): boolean;
	setPersistent(sessionId: string, value: boolean): void;

	hasLayoutSnapshot(sessionId: string): boolean;

	/** Terminal auto-open policy for the session about to become foreground. */
	getTerminalForegroundPolicy(sessionId: string | undefined): 'default' | 'suppressEnsure';

	/** Before leaving foreground on session switch (non-persistent path kills runtime). */
	suspendForegroundSession(session: ISession, options: { readonly kill: boolean }): Promise<void>;

	/** After session is loaded in the grid — template or in-memory snapshot. */
	applyForegroundLayout(session: ISession): Promise<void>;

	getDashboardSignals(sessionId: string): IObservable<IDroxSessionDashboardSignals>;

	/** CPU / RAM / disk samples for a persistent session (empty when not tracked). */
	getResourceMetrics(sessionId: string): IObservable<IDroxSessionResourceMetricsView>;
}
