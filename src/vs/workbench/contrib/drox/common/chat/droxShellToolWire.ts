/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { isWindows } from '../../../../../base/common/platform.js';

export type DroxShellKind = 'cmd' | 'powershell' | 'bash';

export interface IDroxShellToolOutputWire {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exit_code?: number | null;
	readonly timed_out?: boolean;
	readonly duration_ms?: number;
	readonly error?: string;
	/** Present when the command ran in the shared IDE agent terminal. */
	readonly terminal_instance_id?: number;
	/** User skipped a stuck shell via the Skip control. */
	readonly skipped?: boolean;
}

export interface IDroxShellToolStartWire {
	readonly shellKind: DroxShellKind;
	readonly shellCommand: string;
	readonly shellDescription?: string;
}

/** Host shell for the `bash` tool — Windows uses `cmd.exe /C`, not PowerShell. */
export function resolveDroxShellKind(): DroxShellKind {
	return isWindows ? 'cmd' : 'bash';
}

export function buildShellToolStartWire(name: string, args: unknown): IDroxShellToolStartWire | undefined {
	if (name !== 'bash') {
		return undefined;
	}
	const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
	const command = typeof a.command === 'string' ? a.command.trim() : '';
	if (!command) {
		return undefined;
	}
	const description = typeof a.description === 'string' ? a.description.trim() : '';
	return {
		shellKind: resolveDroxShellKind(),
		shellCommand: command,
		shellDescription: description || undefined,
	};
}

/**
 * What the user should see in the tool row: the real command first.
 * Model `description` is optional intent, never a substitute for the command.
 */
export function formatShellToolDisplayLabel(
	shellCommand: string,
	shellDescription?: string,
	maxCommandChars = 100,
): string {
	const cmd = shellCommand.trim();
	if (!cmd) {
		return shellDescription?.trim() || 'Shell command';
	}
	const short =
		cmd.length > maxCommandChars ? `${cmd.slice(0, maxCommandChars)}…` : cmd;
	const desc = shellDescription?.trim();
	if (desc && desc !== cmd && !cmd.startsWith(desc)) {
		return `${short} — ${desc}`;
	}
	return short;
}

export function buildShellToolFinishWire(
	name: string | undefined,
	output: unknown,
	isError: boolean,
): IDroxShellToolOutputWire | undefined {
	if (name !== 'bash') {
		return undefined;
	}
	if (!output || typeof output !== 'object') {
		if (isError) {
			const text = typeof output === 'string' ? output : 'command failed';
			const skipped = /skipped by user|the user stopped this command/i.test(text);
			return { error: text, skipped: skipped || undefined };
		}
		return undefined;
	}
	const o = output as Record<string, unknown>;
	const exitCode =
		typeof o.exit_code === 'number' ? o.exit_code :
			o.exit_code === null ? null :
				undefined;
	const durationMs =
		typeof o.duration_ms === 'number' && Number.isFinite(o.duration_ms) ? o.duration_ms : undefined;
	const error =
		typeof o.error === 'string' && o.error.trim() ? o.error.trim() :
			isError && typeof o.message === 'string' ? o.message :
				undefined;
	const terminalInstanceId =
		typeof o.terminal_instance_id === 'number' && Number.isFinite(o.terminal_instance_id)
			? Math.trunc(o.terminal_instance_id)
			: undefined;
	const skipped = o.skipped === true
		|| (typeof error === 'string' && /skipped by user|the user stopped this command/i.test(error));
	return {
		stdout: typeof o.stdout === 'string' ? o.stdout : '',
		stderr: typeof o.stderr === 'string' ? o.stderr : '',
		timed_out: Boolean(o.timed_out),
		exit_code: exitCode,
		duration_ms: durationMs,
		error,
		terminal_instance_id: terminalInstanceId,
		skipped: skipped || undefined,
	};
}

/**
 * Flatten bash tool stdout/stderr/error for the Agents collapsible terminal
 * (xterm snapshot). Lone `\n` becomes staircase in detached xterm — normalize
 * to `\r\n` like {@link getTerminalOutput} in the agent-host adapter.
 */
export function formatShellTerminalCommandOutputText(
	shellOutput: IDroxShellToolOutputWire,
): string {
	const parts: string[] = [];
	// The stop sentence is for the model. The card keeps the command output only.
	if (shellOutput.error?.trim() && !shellOutput.skipped) {
		parts.push(shellOutput.error.trimEnd());
	}
	if (shellOutput.stdout?.trim()) {
		parts.push(shellOutput.stdout.replace(/\s+$/, ''));
	}
	if (shellOutput.stderr?.trim()) {
		parts.push(shellOutput.stderr.replace(/\s+$/, ''));
	}
	return parts.join('\n').replace(/\r?\n/g, '\r\n');
}

/** Shape expected by VS Code Agents `ChatTerminalToolProgressPart`. */
export interface IDroxAgentsShellTerminalToolSpecificData {
	readonly kind: 'terminal';
	readonly language: DroxShellKind;
	readonly commandLine: {
		readonly original: string;
		readonly forDisplay?: string;
	};
	readonly terminalCommandOutput?: {
		readonly text: string;
		readonly truncated?: boolean;
		readonly lineCount?: number;
	};
	readonly terminalCommandState?: {
		readonly exitCode?: number;
		readonly timestamp?: number;
		readonly duration?: number;
	};
}

/**
 * Build Agents chat `toolSpecificData` for a bash tool — start (command only)
 * or finish (command + collapsible terminal output).
 */
export function buildAgentsShellTerminalToolSpecificData(
	start: IDroxShellToolStartWire,
	finish?: IDroxShellToolOutputWire,
	isError = false,
): IDroxAgentsShellTerminalToolSpecificData {
	const base: IDroxAgentsShellTerminalToolSpecificData = {
		kind: 'terminal',
		language: start.shellKind,
		commandLine: {
			original: start.shellCommand,
			forDisplay: formatShellToolDisplayLabel(start.shellCommand, start.shellDescription),
		},
	};
	if (!finish && !isError) {
		return base;
	}
	const text = finish
		? formatShellTerminalCommandOutputText(finish)
		: '';
	// A finished exit code closes the card. Undefined keeps the "Running" badge.
	const exitCode = finish?.skipped
		? 130
		: typeof finish?.exit_code === 'number'
			? finish.exit_code
			: isError || Boolean(finish?.error) || finish?.timed_out
				? 1
				: 0;
	return {
		...base,
		terminalCommandOutput: {
			text: finish?.skipped
				? text
				: (text || (isError ? (finish?.error || 'Command failed.') : '')),
		},
		terminalCommandState: {
			exitCode,
			timestamp: Date.now(),
			duration: finish?.duration_ms,
		},
	};
}
