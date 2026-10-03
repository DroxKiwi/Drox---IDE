/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IDroxPortForwardProbeArgs,
	IDroxPortForwardProbeResult,
	IDroxPortForwardStartArgs,
	IDroxPortForwardStartResult,
	IDroxPortForwardStopArgs,
} from '../common/droxIpc.js';

function sessionKey(windowId: number, forwardId: string): string {
	return `${windowId}:${forwardId}`;
}

interface IRunningForward {
	readonly child: ChildProcess;
	readonly startedAt: number;
}

/**
 * Main-process host for long-lived external forward tools (ssh, socat, …).
 */
export class DroxPortsProcessHost {

	private readonly _running = new Map<string, IRunningForward>();

	constructor(private readonly logService: ILogService) { }

	async start(args: IDroxPortForwardStartArgs): Promise<IDroxPortForwardStartResult> {
		const key = sessionKey(args.windowId, args.forwardId);
		await this.stop({ windowId: args.windowId, forwardId: args.forwardId });

		const command = args.command.trim();
		if (!command) {
			return { ok: false, error: 'command is empty' };
		}

		try {
			const child = spawn(command, [...args.args], {
				cwd: args.cwd || undefined,
				env: { ...process.env, ...(args.env ?? {}) },
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
				shell: false,
			});

			const running: IRunningForward = { child, startedAt: Date.now() };
			this._running.set(key, running);

			child.stdout?.on('data', (buf: Buffer) => {
				this.logService.trace(`[drox-ports] ${key} stdout: ${buf.toString('utf8').slice(0, 500)}`);
			});
			child.stderr?.on('data', (buf: Buffer) => {
				this.logService.trace(`[drox-ports] ${key} stderr: ${buf.toString('utf8').slice(0, 500)}`);
			});
			child.on('exit', (code, signal) => {
				const cur = this._running.get(key);
				if (cur?.child === child) {
					this._running.delete(key);
				}
				this.logService.trace(`[drox-ports] ${key} exit code=${code} signal=${signal}`);
			});
			child.on('error', err => {
				this.logService.warn(`[drox-ports] ${key} error: ${err}`);
				const cur = this._running.get(key);
				if (cur?.child === child) {
					this._running.delete(key);
				}
			});

			// Brief settle — spawn failures often emit 'error' synchronously.
			await new Promise(r => setTimeout(r, 50));
			if (child.exitCode !== null || child.signalCode) {
				this._running.delete(key);
				return { ok: false, error: `process exited immediately (code=${child.exitCode}, signal=${child.signalCode})` };
			}

			return { ok: true, pid: child.pid };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	async stop(args: IDroxPortForwardStopArgs): Promise<void> {
		const key = sessionKey(args.windowId, args.forwardId);
		const running = this._running.get(key);
		if (!running) {
			return;
		}
		this._running.delete(key);
		const { child } = running;
		try {
			if (process.platform === 'win32') {
				child.kill();
			} else {
				child.kill('SIGTERM');
				setTimeout(() => {
					try {
						if (!child.killed) {
							child.kill('SIGKILL');
						}
					} catch {
						// ignore
					}
				}, 2000);
			}
		} catch (err) {
			this.logService.trace(`[drox-ports] stop ${key}: ${err}`);
		}
	}

	async stopAllForWindow(windowId: number): Promise<void> {
		const prefix = `${windowId}:`;
		const ids: string[] = [];
		for (const key of this._running.keys()) {
			if (key.startsWith(prefix)) {
				ids.push(key.slice(prefix.length));
			}
		}
		for (const forwardId of ids) {
			await this.stop({ windowId, forwardId });
		}
	}

	probe(args: IDroxPortForwardProbeArgs): Promise<IDroxPortForwardProbeResult> {
		const host = args.host.trim() || '127.0.0.1';
		const port = args.port;
		const timeoutMs = Math.min(Math.max(args.timeoutMs ?? 800, 100), 10_000);
		return new Promise(resolve => {
			const socket = net.connect({ host, port });
			let settled = false;
			const done = (ok: boolean) => {
				if (settled) {
					return;
				}
				settled = true;
				socket.removeAllListeners();
				socket.destroy();
				resolve({ ok });
			};
			socket.setTimeout(timeoutMs);
			socket.once('connect', () => done(true));
			socket.once('timeout', () => done(false));
			socket.once('error', () => done(false));
		});
	}
}
