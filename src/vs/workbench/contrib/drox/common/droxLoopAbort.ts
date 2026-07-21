/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** True when the engine aborted for an unresolved tool/action loop. */
export function isDroxLoopDetectedError(raw: string | undefined): boolean {
	return typeof raw === 'string' && /loop detected/i.test(raw);
}

/** System hint shown above the error (webview append role:system). */
export function getDroxLoopAbortHint(): string {
	return localize(
		'drox.loop.abort.hint',
		'The run stopped: the model kept looping despite automatic re-framing. Read the “Re-perspective” messages above, then rephrase or send a new instruction.',
	);
}

/** User-facing abort line (webview error / Agents errorDetails). */
export function getDroxLoopAbortErrorMessage(): string {
	return localize(
		'drox.loop.abort.error',
		'Run stopped — unresolved loop (see the system message just above).',
	);
}

/**
 * Agents has no separate system append — combine hint + short error.
 * Non-loop errors are returned unchanged.
 */
export function formatDroxAgentsLoopAbortMessage(raw: string): string {
	if (!isDroxLoopDetectedError(raw)) {
		return raw;
	}
	return `${getDroxLoopAbortHint()}\n\n${getDroxLoopAbortErrorMessage()}`;
}
