/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Latch for the in-flight client `bash` tool/exec wait.
 * Skip can always unblock the agent even if IDE-terminal / ExecBash
 * process tracking missed the child.
 */

export interface IDroxActiveBashSkipHandle {
	/** Interrupt backend + resolve the tool wait as skipped. */
	skip(): Promise<boolean>;
}

let activeHandle: IDroxActiveBashSkipHandle | undefined;

export function setActiveDroxBashSkipHandle(handle: IDroxActiveBashSkipHandle | undefined): void {
	activeHandle = handle;
}

export function hasActiveDroxBashSkipHandle(): boolean {
	return activeHandle !== undefined;
}

export async function skipRegisteredDroxBash(): Promise<boolean> {
	const handle = activeHandle;
	if (!handle) {
		return false;
	}
	return handle.skip();
}
