/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ChildProcess, spawn } from 'child_process';

import { isWindows } from '../../../../base/common/platform.js';

import {
	clampDroxBashTimeoutMs,
	DROX_BASH_USER_STOPPED,
	IDroxBashExecArgs,
	IDroxBashExecResult,
} from '../common/droxBash.js';

const MAX_STREAM_BYTES = 30 * 1024;

function killProcessTree(child: ChildProcess): void {
	const pid = child.pid;
	if (isWindows && pid) {
		try {
			spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
		} catch {
			/* ignore */
		}
	}
	try {
		child.kill();
	} catch {
		/* already gone */
	}
}

function shellSpec(): { cmd: string; flag: string } {
	if (isWindows) {
		return { cmd: 'cmd.exe', flag: '/C' };
	}
	return { cmd: 'sh', flag: '-c' };
}

function sanitizeCwd(cwd: string | undefined): string | undefined {
	if (!cwd || !isWindows) {
		return cwd;
	}
	let p = cwd;
	if (p.startsWith('\\\\?\\UNC\\')) {
		p = '\\\\' + p.slice('\\\\?\\UNC\\'.length);
	} else if (p.startsWith('\\\\?\\')) {
		p = p.slice(4);
	}
	return p;
}

interface ICaptureBuf {
	parts: string[];
	size: number;
	truncated: boolean;
}

function newBuf(): ICaptureBuf {
	return { parts: [], size: 0, truncated: false };
}

function pushChunk(buf: ICaptureBuf, chunk: Buffer | string): void {
	if (buf.truncated) {
		return;
	}
	const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
	const remaining = MAX_STREAM_BYTES - buf.size;
	if (str.length <= remaining) {
		buf.parts.push(str);
		buf.size += str.length;
		return;
	}
	if (remaining > 0) {
		buf.parts.push(str.slice(0, remaining));
		buf.size += remaining;
	}
	buf.parts.push('\n…[truncated]');
	buf.truncated = true;
}

function joinBuf(buf: ICaptureBuf): string {
	return buf.parts.join('');
}

interface IActiveExecBash {
	readonly command: string;
	readonly started: number;
	readonly child: ChildProcess;
	readonly stdoutBuf: ICaptureBuf;
	readonly stderrBuf: ICaptureBuf;
	settle: (res: IDroxBashExecResult) => void;
	settled: boolean;
}

/** At most one awaited ExecBash (Agents path) — Skip kills this child. */
let activeExecBash: IActiveExecBash | undefined;

/**
 * Kill the active main-process ExecBash and settle with `skipped: true`.
 * Returns true when a run was interrupted.
 */
export function skipActiveDroxBashExec(): boolean {
	const active = activeExecBash;
	if (!active || active.settled) {
		return false;
	}
	// Settle before kill so a sync `close` cannot win the race with a normal exit.
	active.settle({
		command: active.command,
		exit_code: null,
		stdout: joinBuf(active.stdoutBuf),
		stderr: joinBuf(active.stderrBuf),
		timed_out: false,
		duration_ms: Date.now() - active.started,
		error: DROX_BASH_USER_STOPPED,
		skipped: true,
	});
	killProcessTree(active.child);
	return true;
}

export function hasActiveDroxBashExec(): boolean {
	return Boolean(activeExecBash && !activeExecBash.settled);
}

export async function runDroxBashExec(args: IDroxBashExecArgs): Promise<IDroxBashExecResult> {
	const command = args.command.trim();
	if (!command) {
		return {
			command: '',
			exit_code: null,
			stdout: '',
			stderr: '',
			timed_out: false,
			duration_ms: 0,
			error: 'command must not be empty',
		};
	}

	const timeoutMs = clampDroxBashTimeoutMs(args.timeoutMs);
	const safeCwd = sanitizeCwd(args.cwd);
	const { cmd, flag } = shellSpec();
	const stdoutBuf = newBuf();
	const stderrBuf = newBuf();
	const started = Date.now();

	return new Promise<IDroxBashExecResult>((resolve) => {
		const child = spawn(cmd, [flag, command], {
			cwd: safeCwd,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		const active: IActiveExecBash = {
			command,
			started,
			child,
			stdoutBuf,
			stderrBuf,
			settled: false,
			settle: (res) => {
				if (active.settled) {
					return;
				}
				active.settled = true;
				if (activeExecBash === active) {
					activeExecBash = undefined;
				}
				clearTimeout(timer);
				resolve(res);
			},
		};
		activeExecBash = active;

		const timer = setTimeout(() => {
			killProcessTree(child);
			active.settle({
				command,
				exit_code: null,
				stdout: joinBuf(stdoutBuf),
				stderr: joinBuf(stderrBuf),
				timed_out: true,
				duration_ms: Date.now() - started,
			});
		}, timeoutMs);

		child.stdout?.on('data', (chunk: Buffer) => pushChunk(stdoutBuf, chunk));
		child.stderr?.on('data', (chunk: Buffer) => pushChunk(stderrBuf, chunk));

		child.on('error', (err) => {
			active.settle({
				command,
				exit_code: null,
				stdout: joinBuf(stdoutBuf),
				stderr: joinBuf(stderrBuf),
				timed_out: false,
				duration_ms: Date.now() - started,
				error: `spawn failed: ${err.message}`,
			});
		});

		child.on('close', (code) => {
			// Skip already settled with skipped:true — ignore close.
			if (active.settled) {
				return;
			}
			active.settle({
				command,
				exit_code: code,
				stdout: joinBuf(stdoutBuf),
				stderr: joinBuf(stderrBuf),
				timed_out: false,
				duration_ms: Date.now() - started,
			});
		});
	});
}
