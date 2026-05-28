/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as readline from 'readline';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InitializeOptions, RpcIncoming, RpcRequestHandler, RpcRequestResult } from '../common/droxRpc.js';

/**
 * JSON-RPC NDJSON client for `drox --serve` (runs in the Electron main process).
 */
export class DroxRpcClientMain extends Disposable {

	private readonly child: ChildProcessWithoutNullStreams;
	private readonly rl: readline.Interface;
	private nextId = 1;
	private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
	private readonly requestHandlers = new Map<string, RpcRequestHandler>();
	private disposed = false;

	private readonly _onLog = this._register(new Emitter<string>());
	readonly onLog: Event<string> = this._onLog.event;

	private readonly _onNotification = this._register(new Emitter<{ method: string; params: unknown }>());
	readonly onNotification: Event<{ method: string; params: unknown }> = this._onNotification.event;

	private readonly _onServerRequest = this._register(new Emitter<{ id: number | string; method: string; params: unknown }>());
	readonly onServerRequest: Event<{ id: number | string; method: string; params: unknown }> = this._onServerRequest.event;

	private readonly _onExit = this._register(new Emitter<{ code: number | null; signal: string | null }>());
	readonly onExit: Event<{ code: number | null; signal: string | null }> = this._onExit.event;

	private readonly _onError = this._register(new Emitter<Error>());
	readonly onError: Event<Error> = this._onError.event;

	constructor(
		private readonly executable: string,
		cwd: string,
		envOverrides: Record<string, string> = {},
	) {
		super();

		const env: NodeJS.ProcessEnv = { ...process.env };
		for (const [k, v] of Object.entries(envOverrides)) {
			if (typeof v === 'string' && v.length > 0) {
				env[k] = v;
			}
		}

		this.child = spawn(this.executable, ['--serve'], {
			cwd,
			env,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});

		this.child.stderr?.on('data', (chunk: Buffer) => {
			this._onLog.fire(chunk.toString('utf8'));
		});

		this.child.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') {
				const wrapped = new Error(
					`drox binary not found: \`${this.executable}\`. ` +
					`Build with \`cargo build -p drox-cli\` in drox-engine/drox or set drox.executablePath.`,
				);
				this._onError.fire(wrapped);
			} else {
				this._onError.fire(err);
			}
		});

		this.child.on('exit', (code, signal) => {
			this.dispose();
			this._onExit.fire({ code, signal });
		});

		this.rl = readline.createInterface({
			input: this.child.stdout,
			crlfDelay: Infinity,
		});

		this.rl.on('line', line => this.onLine(line));
	}

	private onLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) {
			return;
		}
		let msg: RpcIncoming;
		try {
			msg = JSON.parse(trimmed) as RpcIncoming;
		} catch {
			this._onLog.fire(`[parse] invalid JSON line: ${trimmed.slice(0, 200)}…\n`);
			return;
		}

		const hasMethod = 'method' in msg && typeof msg.method === 'string';
		const hasId = 'id' in msg && msg.id !== null && msg.id !== undefined;

		if (hasMethod && hasId) {
			const r = msg as { id: number | string; method: string; params?: unknown };
			this._onServerRequest.fire({ id: r.id, method: r.method, params: r.params });
			return;
		}

		if (('result' in msg || 'error' in msg) && hasId) {
			const r = msg as { id: number | string; result?: unknown; error?: { code: number; message: string } };
			const key = String(r.id);
			const p = this.pending.get(key);
			if (!p) {
				return;
			}
			this.pending.delete(key);
			if (r.error) {
				p.reject(new Error(`JSON-RPC ${r.error.code}: ${r.error.message}`));
			} else {
				p.resolve(r.result);
			}
			return;
		}

		if (hasMethod) {
			const n = msg as { method: string; params?: unknown };
			this._onNotification.fire({ method: n.method, params: n.params });
		}
	}

	setRequestHandler(method: string, handler: RpcRequestHandler): void {
		this.requestHandlers.set(method, handler);
	}

	respond(id: number | string, payload: RpcRequestResult): void {
		const response =
			'error' in payload && payload.error
				? { jsonrpc: '2.0', id, error: payload.error }
				: { jsonrpc: '2.0', id, result: payload.result };
		this.writeLine(JSON.stringify(response));
	}

	async handleServerRequest(id: number | string, method: string, params: unknown): Promise<void> {
		const handler = this.requestHandlers.get(method);
		let payload: RpcRequestResult;
		if (!handler) {
			payload = {
				error: {
					code: -32601,
					message: `method not implemented by client: ${method}`,
				},
			};
		} else {
			try {
				payload = await handler(params);
			} catch (e) {
				payload = {
					error: {
						code: -32603,
						message: `handler threw: ${e instanceof Error ? e.message : String(e)}`,
					},
				};
			}
		}
		this.respond(id, payload);
	}

	private writeLine(line: string): void {
		if (this.disposed) {
			return;
		}
		const ok = this.child.stdin.write(`${line}\n`, 'utf8');
		if (!ok) {
			this.child.stdin.once('drain', () => { /* backpressure */ });
		}
	}

	request(method: string, params?: unknown): Promise<unknown> {
		if (this.disposed) {
			return Promise.reject(new Error('drox client closed'));
		}
		const id = this.nextId++;
		const payload = JSON.stringify({
			jsonrpc: '2.0',
			id,
			method,
			params: params ?? {},
		});
		return new Promise((resolve, reject) => {
			this.pending.set(String(id), { resolve, reject });
			this.writeLine(payload);
		});
	}

	async initialize(opts: InitializeOptions = {}): Promise<unknown> {
		return this.request('initialize', {
			protocolVersion: '1.0',
			clientName: 'drox-ide',
			clientVersion: '0.1.0',
			clientCapabilities: {
				executableTools: opts.executableTools ?? [],
				interactiveAsk: opts.interactiveAsk ?? false,
			},
		});
	}

	async shutdown(): Promise<void> {
		if (this.disposed) {
			return;
		}
		try {
			await this.request('shutdown', {});
		} catch {
			/* process may already be gone */
		}
	}

	override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.rl.close();
		for (const [, p] of this.pending) {
			p.reject(new Error('drox client closed'));
		}
		this.pending.clear();
		try {
			this.child.stdin.end();
		} catch {
			/* ignore */
		}
		try {
			this.child.kill();
		} catch {
			/* ignore */
		}
		super.dispose();
	}
}
