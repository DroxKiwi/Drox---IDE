/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const DROX_BASH_OUTPUT_CHANNEL_ID = 'droxBash';

/** Cursor-like default: cut stuck shell and return `timed_out` to the model. */
export const DROX_BASH_DEFAULT_TIMEOUT_MS = 60_000;

/** Tool result when the user stops a running command. The model reads this. The card does not show it. */
export const DROX_BASH_USER_STOPPED = 'The user stopped this command. Resume the current task without running this command again.';

/** setTimeout ceiling (~24.8d) — platform limit, not a product policy cap. */
const DROX_BASH_TIMEOUT_TIMER_CEILING_MS = 2 ** 31 - 1;

/** Resolve bash wall-clock timeout: omit → default 60s; no product max (model may set higher). */
export function clampDroxBashTimeoutMs(timeoutMs: number | undefined): number {
	const raw = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
		? timeoutMs
		: DROX_BASH_DEFAULT_TIMEOUT_MS;
	return Math.min(Math.max(1, Math.trunc(raw)), DROX_BASH_TIMEOUT_TIMER_CEILING_MS);
}

export interface IDroxBashExecArgs {

	readonly command: string;

	readonly cwd?: string;

	readonly timeoutMs?: number;

}



export interface IDroxBashExecResult {

	readonly command: string;

	readonly exit_code: number | null;

	readonly stdout: string;

	readonly stderr: string;

	readonly timed_out: boolean;

	readonly duration_ms: number;

	/** IDE panel terminal instance id when run via the shared Drox Agent session. */
	readonly terminal_instance_id?: number;

	readonly error?: string;

	/** True when the user skipped a stuck bash (IDE terminal Ctrl+C or ExecBash kill). */
	readonly skipped?: boolean;

}

/**
 * Strip Windows extended-length / UNC prefixes that break `cmd.exe` cwd
 * (dogfood: `\\?\C:\…` → shell lands in `C:\Windows`).
 */
export function sanitizeDroxAgentTerminalCwd(cwd: string | undefined): string | undefined {
	if (!cwd) {
		return undefined;
	}
	let s = cwd.trim();
	if (!s) {
		return undefined;
	}
	// `\\?\UNC\server\share\…` → `\\server\share\…`
	if (s.startsWith('\\\\?\\UNC\\') || s.startsWith('\\\\?\\unc\\')) {
		s = `\\\\${s.slice('\\\\?\\UNC\\'.length)}`;
	} else if (s.startsWith('\\\\?\\')) {
		s = s.slice('\\\\?\\'.length);
	}
	return s;
}

/** Unique line marker so IDE terminal capture can drop prior scrollback (P0). */
export function createDroxBashStdoutMarker(): string {
	return `__DROX_BASH_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}__`;
}

/**
 * Wrap the user command so stdout can be sliced after a known marker.
 * Windows agent shell is `cmd.exe` (`echo MARK& cmd`); POSIX uses `printf`.
 */
export function wrapDroxBashCommandWithMarker(
	command: string,
	marker: string,
	windows: boolean,
): string {
	const cmd = command.trim();
	if (!cmd || !marker) {
		return command;
	}
	if (windows) {
		return `echo ${marker}& ${cmd}`;
	}
	// Single-quoted marker — generator only emits [A-Za-z0-9_].
	return `printf '%s\\n' '${marker}'; ${cmd}`;
}

/**
 * Keep only text after the last marker occurrence. Empty if marker missing
 * (prefer no stdout over stale scrollback).
 */
export function extractStdoutAfterDroxBashMarker(text: string, marker: string): string {
	if (!text || !marker) {
		return '';
	}
	const idx = text.lastIndexOf(marker);
	if (idx < 0) {
		return '';
	}
	return text.slice(idx + marker.length).replace(/^[\r\n]+/, '');
}

