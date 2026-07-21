/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AMB-01 P1 — after a run ends, the UI plan is cleared/archived but transcript
 * may still show old todo_write. One-shot system note on the next agent.run.
 */

const pendingBySession = new Set<string>();

export function markDroxPlanArchivedForNextRun(sessionId: string | undefined): void {
	const id = sessionId?.trim();
	if (!id) {
		return;
	}
	pendingBySession.add(id);
}

/** Returns the note once, then clears the flag for that session. */
export function consumeDroxPlanArchiveSystemNote(sessionId: string | undefined): string | undefined {
	const id = sessionId?.trim();
	if (!id || !pendingBySession.delete(id)) {
		return undefined;
	}
	return (
		'The previous agent.run todo plan was archived at end of run. ' +
		'Do not treat older todo_write entries in this transcript as the active plan. ' +
		'If you need a plan before mutating, call todo_write again in this run.'
	);
}

/** Test helper. */
export function resetDroxPlanArchiveNotesForTest(): void {
	pendingBySession.clear();
}
