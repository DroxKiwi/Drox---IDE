/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** True when the engine aborted for an unresolved tool/action loop. */
export function isDroxLoopDetectedError(raw: string | undefined): boolean {
	return typeof raw === 'string' && /loop detected/i.test(raw);
}

/** True when the abort kind is FX-B intent-only write (announce without tool_call). */
export function isDroxIntentOnlyWriteLoopError(raw: string | undefined): boolean {
	return typeof raw === 'string' && /intent_only_write/i.test(raw);
}

/** System hint shown above the error (webview append role:system). */
export function getDroxLoopAbortHint(raw?: string): string {
	if (isDroxIntentOnlyWriteLoopError(raw)) {
		return localize(
			'drox.loop.abort.hint.intentOnlyWrite',
			'The run stopped: the model kept announcing a file write without calling `file_write` / `file_edit` (often a page that is too large for one shot). Ask it to write a skeleton first, then section by section.',
		);
	}
	return localize(
		'drox.loop.abort.hint',
		'The run stopped: the model kept looping despite automatic re-framing. Read the “Re-perspective” messages above, then rephrase or send a new instruction.',
	);
}

/** User-facing abort line (webview error / Agents errorDetails). */
export function getDroxLoopAbortErrorMessage(raw?: string): string {
	if (isDroxIntentOnlyWriteLoopError(raw)) {
		return localize(
			'drox.loop.abort.error.intentOnlyWrite',
			'Run stopped — write announced without tool call (prefer skeleton + section-by-section).',
		);
	}
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
	return `${getDroxLoopAbortHint(raw)}\n\n${getDroxLoopAbortErrorMessage(raw)}`;
}
