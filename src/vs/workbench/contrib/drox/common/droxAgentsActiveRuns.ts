/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

const agentsWindowRunIds = new Set<string>();

export function registerDroxAgentsWindowRun(runId: string): void {
	agentsWindowRunIds.add(runId);
}

export function unregisterDroxAgentsWindowRun(runId: string): void {
	agentsWindowRunIds.delete(runId);
}

export function isDroxAgentsWindowRun(runId: string | undefined): boolean {
	return typeof runId === 'string' && agentsWindowRunIds.has(runId);
}
