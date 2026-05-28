/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IOutputService } from '../../../services/output/common/output.js';
import {
	DROX_ENGINE_CHANNEL_NAME,
	DROX_OUTPUT_CHANNEL_ID,
	IDroxEngineErrorPayload,
	IDroxEngineExitPayload,
	IDroxEngineLogPayload,
	IDroxEngineNotificationPayload,
	IDroxEngineServerRequestPayload,
} from '../common/droxIpc.js';
import { IDroxExecutableService } from '../common/droxExecutableService.js';
import { IDroxEngineService, InitializeOptions, RpcRequestHandler } from '../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { RpcRequestResult } from '../common/droxRpc.js';
import { DroxEngineChannelClient } from './droxEngineChannelClient.js';

export class DroxEngineService extends Disposable implements IDroxEngineService {

	declare readonly _serviceBrand: undefined;

	private readonly ipc: DroxEngineChannelClient;
	private readonly requestHandlers = new Map<string, RpcRequestHandler>();
	private _started = false;
	private _initialized = false;
	private _initializePromise: Promise<unknown> | undefined;
	private readonly _clientCapabilities = {
		executableTools: [] as string[],
		interactiveAsk: true,
	};

	private readonly _onLog = this._register(new Emitter<IDroxEngineLogPayload>());
	readonly onLog = this._onLog.event;

	private readonly _onNotification = this._register(new Emitter<IDroxEngineNotificationPayload>());
	readonly onNotification = this._onNotification.event;

	private readonly _onServerRequest = this._register(new Emitter<IDroxEngineServerRequestPayload>());
	readonly onServerRequest = this._onServerRequest.event;

	private readonly _onExit = this._register(new Emitter<IDroxEngineExitPayload>());
	readonly onExit = this._onExit.event;

	private readonly _onError = this._register(new Emitter<IDroxEngineErrorPayload>());
	readonly onError = this._onError.event;

	get isStarted(): boolean {
		return this._started;
	}

	get isInitialized(): boolean {
		return this._initialized;
	}

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxExecutableService private readonly executableService: IDroxExecutableService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IOutputService private readonly outputService: IOutputService,
	) {
		super();

		const windowId = this.environmentService.window.id;
		this.ipc = this._register(new DroxEngineChannelClient(
			mainProcessService.getChannel(DROX_ENGINE_CHANNEL_NAME),
			windowId,
		));

		this._register(this.ipc.onLog(e => {
			this._onLog.fire(e);
			this.appendEngineLog(e.text);
		}));
		this._register(this.ipc.onNotification(e => this._onNotification.fire(e)));
		this._register(this.ipc.onExit(e => {
			this._started = false;
			this._onExit.fire(e);
		}));
		this._register(this.ipc.onError(e => {
			this._started = false;
			this._onError.fire(e);
			this.appendEngineLog(`[error] ${e.message}\n`);
		}));

		this._register(this.ipc.onServerRequest(e => {
			this._onServerRequest.fire(e);
			void this.dispatchServerRequest(e.id, e.method, e.params);
		}));
	}

	async start(): Promise<void> {
		if (this._started) {
			return;
		}

		const executable = await this.executableService.resolve();
		const folders = this.workspaceContextService.getWorkspace().folders;
		const cwd = folders[0]?.uri.fsPath ?? this.environmentService.userHome.fsPath;

		const env = this.runSettingsService.getEnvOverrides();
		this.appendEngineLog(`[start] ${executable}\n[cwd] ${cwd}\n`);
		await this.ipc.start(executable, cwd, env);
		this._started = true;
	}

	async initialize(opts: InitializeOptions = {}): Promise<unknown> {
		this.mergeInitializeOptions(opts);
		const run = async () => {
			const result = await this.doInitialize();
			this._initialized = true;
			return result;
		};
		if (!this._initializePromise) {
			this._initializePromise = run().finally(() => {
				this._initializePromise = undefined;
			});
			return this._initializePromise;
		}
		return this._initializePromise.then(() => run());
	}

	private mergeInitializeOptions(opts: InitializeOptions): void {
		if (opts.executableTools && opts.executableTools.length > 0) {
			this._clientCapabilities.executableTools = [...opts.executableTools];
		}
		if (opts.interactiveAsk !== false) {
			this._clientCapabilities.interactiveAsk = true;
		}
	}

	private async doInitialize(): Promise<unknown> {
		await this.start();
		return this.request('initialize', {
			protocolVersion: '1.0',
			clientName: 'drox-ide',
			clientVersion: '0.1.0',
			clientCapabilities: {
				executableTools: this._clientCapabilities.executableTools,
				interactiveAsk: this._clientCapabilities.interactiveAsk,
			},
		});
	}

	request(method: string, params?: unknown): Promise<unknown> {
		return this.ipc.request(method, params);
	}

	fetchHttp(url: string, headers?: Record<string, string>): Promise<{ statusCode: number; body: string }> {
		return this.ipc.fetchHttp(url, headers);
	}

	setRequestHandler(method: string, handler: RpcRequestHandler): void {
		this.requestHandlers.set(method, handler);
	}

	async shutdown(): Promise<void> {
		if (!this._started) {
			return;
		}
		try {
			await this.ipc.request('shutdown', {});
		} catch {
			/* ignore */
		}
		await this.ipc.shutdown();
		this.resetEngineState();
	}

	override async dispose(): Promise<void> {
		await this.shutdown();
		await this.ipc.disposeEngine();
		this.resetEngineState();
	}

	private resetEngineState(): void {
		this._started = false;
		this._initialized = false;
		this._initializePromise = undefined;
		this._clientCapabilities.executableTools = [];
		this._clientCapabilities.interactiveAsk = true;
	}

	private async dispatchServerRequest(id: number | string, method: string, params: unknown): Promise<void> {
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
		await this.ipc.respondServerRequest(id, payload);
	}

	private appendEngineLog(text: string): void {
		const channel = this.outputService.getChannel(DROX_OUTPUT_CHANNEL_ID);
		channel?.append(text);
	}
}
