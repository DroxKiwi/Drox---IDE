/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { isWindows } from '../../../../../base/common/platform.js';

export type DroxShellKind = 'powershell' | 'bash';

export interface IDroxShellToolOutputWire {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exit_code?: number | null;
	readonly timed_out?: boolean;
	readonly duration_ms?: number;
	readonly error?: string;
}

export interface IDroxShellToolStartWire {
	readonly shellKind: DroxShellKind;
	readonly shellCommand: string;
	readonly shellDescription?: string;
}

export function resolveDroxShellKind(): DroxShellKind {
	return isWindows ? 'powershell' : 'bash';
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
			return { error: typeof output === 'string' ? output : 'command failed' };
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
	return {
		stdout: typeof o.stdout === 'string' ? o.stdout : '',
		stderr: typeof o.stderr === 'string' ? o.stderr : '',
		timed_out: Boolean(o.timed_out),
		exit_code: exitCode,
		duration_ms: durationMs,
		error,
	};
}
