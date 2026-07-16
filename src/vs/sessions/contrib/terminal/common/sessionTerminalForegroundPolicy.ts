/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Controls whether {@link SessionsTerminalContribution} auto-opens a terminal on session focus. */
export type SessionTerminalForegroundPolicy = 'default' | 'suppressEnsure';

let policyForSession: ((sessionId: string | undefined) => SessionTerminalForegroundPolicy) | undefined;

export function registerSessionTerminalForegroundPolicy(
	fn: (sessionId: string | undefined) => SessionTerminalForegroundPolicy,
): void {
	policyForSession = fn;
}

export function getSessionTerminalForegroundPolicy(sessionId: string | undefined): SessionTerminalForegroundPolicy {
	return policyForSession ? policyForSession(sessionId) : 'default';
}
