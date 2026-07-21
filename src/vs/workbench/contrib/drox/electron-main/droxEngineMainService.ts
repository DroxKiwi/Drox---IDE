/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { existsSync } from 'fs';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { isBareDroxExecutableName } from '../common/droxExecutable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IDroxEngineErrorPayload,
	IDroxEngineExitPayload,
	IDroxEngineLogPayload,
	IDroxEngineNotificationPayload,
	IDroxEngineRespondArgs,
	IDroxEngineServerRequestPayload,
	IDroxEngineStartArgs,
} from '../common/droxIpc.js';
import { IDroxBashExecArgs, IDroxBashExecResult } from '../common/droxBash.js';
import { IDroxFetchHttpArgs, IDroxFetchHttpResult } from '../common/droxIpc.js';
import { runDroxBashExec } from './droxBashExec.js';
import {
	defaultDroxInstallDir,
	isUnresolvedBareDroxExecutable,
	resolveDroxExecutableOnDisk,
} from './droxExecutableMain.js';
import { droxLocalHttpGet, droxLocalHttpRequest } from './droxLocalHttp.js';
import { DroxRpcClientMain } from './droxRpcClientMain.js';

interface IDroxEngineHostCallbacks {
	readonly onLog: (text: string) => void;
	readonly onNotification: (e: { method: string; params: unknown }) => void;
	readonly onServerRequest: (e: { id: number | string; method: string; params: unknown }) => void;
	readonly onExit: (e: { code: number | null; signal: string | null }) => void;
	readonly onError: (err: Error) => void;
}

class DroxEngineHost extends Disposable {
	readonly client: DroxRpcClientMain;

	constructor(
		readonly windowId: number,
		executable: string,
		cwd: string,
		env: Record<string, string>,
		callbacks: IDroxEngineHostCallbacks,
	) {
		super();
		this.client = this._register(new DroxRpcClientMain(executable, cwd, env));
		this._register(this.client.onLog(callbacks.onLog));
		this._register(this.client.onNotification(callbacks.onNotification));
		this._register(this.client.onServerRequest(callbacks.onServerRequest));
		this._register(this.client.onExit(callbacks.onExit));
		this._register(this.client.onError(callbacks.onError));
	}
}

export class DroxEngineMainService extends Disposable {

	private readonly hosts = this._register(new DisposableMap<number, DroxEngineHost>());

	private readonly _onLog = this._register(new Emitter<IDroxEngineLogPayload>());
	readonly onLog: Event<IDroxEngineLogPayload> = this._onLog.event;

	private readonly _onNotification = this._register(new Emitter<IDroxEngineNotificationPayload>());
	readonly onNotification: Event<IDroxEngineNotificationPayload> = this._onNotification.event;

	private readonly _onServerRequest = this._register(new Emitter<IDroxEngineServerRequestPayload>());
	readonly onServerRequest: Event<IDroxEngineServerRequestPayload> = this._onServerRequest.event;

	private readonly _onExit = this._register(new Emitter<IDroxEngineExitPayload>());
	readonly onExit: Event<IDroxEngineExitPayload> = this._onExit.event;

	private readonly _onError = this._register(new Emitter<IDroxEngineErrorPayload>());
	readonly onError: Event<IDroxEngineErrorPayload> = this._onError.event;

	constructor(@ILogService private readonly logService: ILogService) {
		super();
	}

	async start(args: IDroxEngineStartArgs): Promise<void> {
		let { windowId, executable, cwd, env = {} } = args;
		await this.disposeWindow(windowId);

		const hints = args.resolveHints;
		const configuredPath = hints?.configuredPath?.trim() ?? '';
		if (configuredPath.length > 0 && !isBareDroxExecutableName(configuredPath) && !existsSync(configuredPath)) {
			this.logService.warn(
				`[Drox] drox.executablePath not found (${configuredPath}) — probing workspace / appRoot / installDir`,
			);
		}

		if (isUnresolvedBareDroxExecutable(executable)) {
			const resolved = resolveDroxExecutableOnDisk({
				configuredPath,
				installDir: defaultDroxInstallDir(),
				appRoot: hints?.appRoot,
				workspaceFolderPaths: hints?.workspaceFolderPaths ?? (cwd ? [cwd] : []),
			});
			if (resolved) {
				this.logService.info(`[Drox] resolved engine: ${resolved}`);
				executable = resolved;
			}
		} else if (!existsSync(executable)) {
			this.logService.error(`[Drox] engine binary missing: ${executable}`);
		}

		const host = new DroxEngineHost(windowId, executable, cwd, env, {
			onLog: text => this._onLog.fire({ windowId, text }),
			onNotification: e => this._onNotification.fire({ windowId, method: e.method, params: e.params }),
			onServerRequest: e => this._onServerRequest.fire({ windowId, id: e.id, method: e.method, params: e.params }),
			onExit: e => {
				this._onExit.fire({ windowId, code: e.code, signal: e.signal });
				this.hosts.deleteAndDispose(windowId);
			},
			onError: err => {
				this.logService.error('[Drox]', err);
				this._onError.fire({ windowId, message: err.message });
			},
		});
		this.hosts.set(windowId, host);

		this.logService.info(`[Drox] started engine for window ${windowId}: ${executable} (cwd=${cwd})`);
	}

	request(windowId: number, method: string, params?: unknown): Promise<unknown> {
		const host = this.hosts.get(windowId);
		if (!host) {
			return Promise.reject(new Error('Drox engine not started for this window'));
		}
		return host.client.request(method, params);
	}

	execBash(args: IDroxBashExecArgs): Promise<IDroxBashExecResult> {
		return runDroxBashExec(args);
	}

	fetchHttp(args: IDroxFetchHttpArgs): Promise<IDroxFetchHttpResult> {
		const headers = args.headers ? { ...args.headers } : undefined;
		const method = args.method ?? 'GET';
		if (method === 'GET' && args.body === undefined) {
			return droxLocalHttpGet(args.url, undefined, headers);
		}
		return droxLocalHttpRequest(args.url, { method, headers, body: args.body });
	}

	respondServerRequest(args: IDroxEngineRespondArgs): void {
		const host = this.hosts.get(args.windowId);
		if (!host) {
			return;
		}
		const payload =
			args.payload.error
				? { error: args.payload.error }
				: { result: args.payload.result };
		host.client.respond(args.id, payload);
	}

	async shutdown(windowId: number): Promise<void> {
		const host = this.hosts.get(windowId);
		if (!host) {
			return;
		}
		await host.client.shutdown();
		await this.disposeWindow(windowId);
	}

	async disposeWindow(windowId: number): Promise<void> {
		const host = this.hosts.get(windowId);
		if (host) {
			host.client.dispose();
			this.hosts.deleteAndDispose(windowId);
			this.logService.info(`[Drox] disposed engine for window ${windowId}`);
		}
	}
}
