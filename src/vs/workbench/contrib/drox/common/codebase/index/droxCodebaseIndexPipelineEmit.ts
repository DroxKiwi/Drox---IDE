/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../../base/common/event.js';
import {
	DroxCodebasePipelineStepKind,
	IDroxCodebasePipelineEvent,
	DroxCodebasePipelineEventStatus,
} from '../droxCodebaseTypes.js';

/** Emits CB2b pipeline journal events for the cockpit. */
export class DroxCodebaseIndexPipelineEmitter {

	private readonly _onDidPipelineEvent = new Emitter<IDroxCodebasePipelineEvent>();
	readonly onDidPipelineEvent = this._onDidPipelineEvent.event;

	private _eventSeq = 0;
	private _activeRunId: string | undefined;
	private _workspaceRootFsPath: string | undefined;

	dispose(): void {
		this._onDidPipelineEvent.dispose();
	}

	/** Tag subsequent events with this workspace root (partitioned cockpit log). */
	setWorkspaceRoot(rootFsPath: string | undefined): void {
		this._workspaceRootFsPath = rootFsPath?.trim() || undefined;
	}

	emit(
		kind: DroxCodebasePipelineStepKind,
		status: DroxCodebasePipelineEventStatus,
		message: string,
		opts?: { readonly path?: string; readonly detail?: IDroxCodebasePipelineEvent['detail']; readonly runId?: string },
	): void {
		const runId = opts?.runId ?? this._activeRunId ?? `run-${Date.now()}`;
		this._onDidPipelineEvent.fire({
			id: `evt-${++this._eventSeq}`,
			at: Date.now(),
			runId,
			kind,
			status,
			message,
			path: opts?.path,
			rootFsPath: this._workspaceRootFsPath,
			detail: opts?.detail,
		});
	}

	beginRun(trigger: string): string {
		const runId = `run-${Date.now()}-${++this._eventSeq}`;
		this._activeRunId = runId;
		this.emit('run_start', 'running', `Run started (${trigger})`, {
			runId,
			detail: { trigger, progressPct: 0 },
		});
		return runId;
	}

	endRun(ok: boolean, message: string, detail?: IDroxCodebasePipelineEvent['detail']): void {
		this.emit(ok ? 'run_done' : 'error', ok ? 'ok' : 'error', message, {
			detail: { ...detail, progressPct: ok ? 100 : detail?.progressPct },
		});
		this._activeRunId = undefined;
	}
}
