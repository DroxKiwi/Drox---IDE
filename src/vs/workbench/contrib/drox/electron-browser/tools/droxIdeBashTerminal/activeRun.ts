/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxBashExecResult } from '../../../common/droxBash.js';
import { isolateDroxBashCapturedStdout } from '../../../common/droxBashCapture.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { collectRecentBuffer } from './buffer.js';
import {
	findDroxAgentTerminal,
	getSharedAgentTerminal,
	interruptTerminal,
	recycleSharedAgentTerminal,
} from './sharedSession.js';

/**
 * Latch run IDE actif + Skip / forceInterrupt (lot skip).
 */

export interface IActiveIdeBashRun {
	readonly command: string;
	readonly marker: string;
	readonly started: number;
	readonly instance: ITerminalInstance;
	settle: (result: IDroxBashExecResult) => void;
	settled: boolean;
}

/** Currently awaited IDE-terminal bash (at most one — shared agent terminal). */
let activeIdeBashRun: IActiveIdeBashRun | undefined;

export function getActiveIdeBashRun(): IActiveIdeBashRun | undefined {
	return activeIdeBashRun;
}

export function setActiveIdeBashRun(run: IActiveIdeBashRun | undefined): void {
	activeIdeBashRun = run;
}

/**
 * Interrupt the active IDE agent bash (Ctrl+C) and unblock the tool/exec waiter.
 * Returns true if a run was skipped.
 */
export function skipActiveDroxBashInIdeTerminal(): boolean {
	const active = activeIdeBashRun;
	if (!active || active.settled) {
		return false;
	}
	// Settle before Ctrl+C so a sync command-finished cannot win with a normal exit.
	active.settle({
		command: active.command,
		exit_code: null,
		stdout: isolateDroxBashCapturedStdout('', active.marker, '', collectRecentBuffer(active.instance)),
		stderr: '',
		timed_out: false,
		duration_ms: Date.now() - active.started,
		terminal_instance_id: active.instance.instanceId,
		error: 'Skipped by user',
		skipped: true,
	});
	// Recreate shared session — Ctrl+C alone leaves cmd on "Terminate batch (Y/N)?".
	void recycleSharedAgentTerminal();
	return true;
}

export function hasActiveDroxBashInIdeTerminal(): boolean {
	return Boolean(activeIdeBashRun && !activeIdeBashRun.settled);
}

/**
 * Best-effort dispose shared Drox Agent terminal when tracking was lost
 * but a command is still visibly running (or shell is poisoned).
 *
 * Pass `terminalService` so we can still find a live "Drox Agent" panel
 * terminal after the singleton was cleared.
 */
export function forceInterruptDroxAgentTerminal(
	terminalService?: ITerminalService,
): boolean {
	const singleton = getSharedAgentTerminal();
	if (singleton && !singleton.isDisposed) {
		void recycleSharedAgentTerminal();
		return true;
	}
	if (!terminalService) {
		return false;
	}
	const found = findDroxAgentTerminal(terminalService);
	if (!found) {
		return false;
	}
	void (async () => {
		try {
			await interruptTerminal(found);
		} catch {
			/* ignore */
		}
		try {
			await terminalService.safeDisposeTerminal(found);
		} catch {
			try {
				found.dispose();
			} catch {
				/* ignore */
			}
		}
	})();
	return true;
}
