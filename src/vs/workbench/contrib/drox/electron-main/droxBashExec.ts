/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { spawn } from 'child_process';

import { isWindows } from '../../../../base/common/platform.js';

import { IDroxBashExecArgs, IDroxBashExecResult } from '../common/droxBash.js';



const DEFAULT_TIMEOUT_MS = 120_000;

const MAX_TIMEOUT_MS = 600_000;

const MAX_STREAM_BYTES = 30 * 1024;



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



	const timeoutMs = Math.min(args.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

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



		let settled = false;

		const settle = (res: IDroxBashExecResult) => {

			if (settled) {

				return;

			}

			settled = true;

			clearTimeout(timer);

			resolve(res);

		};



		const timer = setTimeout(() => {

			try {

				child.kill();

			} catch {

				/* ignore */

			}

			settle({

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

			settle({

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

			settle({

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

