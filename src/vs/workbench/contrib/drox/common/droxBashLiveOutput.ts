/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live stdout bus for the shared IDE agent bash (lot live-output).
 *
 * Renderer-only: IdeBashTerminal polls the buffer and emits; Agents chat card
 * subscribes to fill the terminal progress "encadré" while Running.
 *
 * Revert: stop emitting from `run.ts` / stop listening in ChatTerminalToolProgressPart.
 */

export interface IDroxBashLiveOutputEvent {
	readonly text: string;
	readonly command?: string;
}

type Listener = (e: IDroxBashLiveOutputEvent) => void;

const listeners = new Set<Listener>();

export function emitDroxBashLiveOutput(e: IDroxBashLiveOutputEvent): void {
	for (const l of listeners) {
		try {
			l(e);
		} catch {
			/* ignore subscriber errors */
		}
	}
}

export function onDroxBashLiveOutput(listener: Listener): { dispose(): void } {
	listeners.add(listener);
	return {
		dispose() {
			listeners.delete(listener);
		},
	};
}
