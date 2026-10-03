/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

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
import { readDroxExecutableConfiguredPath } from '../common/droxExecutable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IDroxExecutableService } from '../common/droxExecutableService.js';
import { DroxEngineInitializeResult, IDroxEngineService, InitializeOptions, RpcRequestHandler } from '../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { RpcRequestResult } from '../common/droxRpc.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import { IDroxTrafficService } from '../common/traffic/droxTrafficService.js';
import { destinationFromUrl, normalizeTrafficDestination } from '../common/traffic/droxTrafficTags.js';
import { DroxTrafficKind } from '../common/traffic/droxTrafficTypes.js';
import { DroxEngineChannelClient } from './droxEngineChannelClient.js';

export class DroxEngineService extends Disposable implements IDroxEngineService {

	declare readonly _serviceBrand: undefined;

	private readonly ipc: DroxEngineChannelClient;
	private readonly requestHandlers = new Map<string, RpcRequestHandler>();
	private _started = false;
	private _initialized = false;
	private _engineDevBuild: number | undefined;
	private _engineGitSha: string | undefined;
	private _resolvedExecutable: string | undefined;
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

	get engineDevBuild(): number | undefined {
		return this._engineDevBuild;
	}

	get engineGitSha(): string | undefined {
		return this._engineGitSha;
	}

	get resolvedExecutable(): string | undefined {
		return this._resolvedExecutable;
	}

	private readonly _onDidInitialize = this._register(new Emitter<DroxEngineInitializeResult>());
	readonly onDidInitialize = this._onDidInitialize.event;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxExecutableService private readonly executableService: IDroxExecutableService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IOutputService private readonly outputService: IOutputService,
		@IDroxTrafficService private readonly trafficService: IDroxTrafficService,
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
		this._register(this.ipc.onNotification(e => {
			this._onNotification.fire(e);
			this.recordTrafficNotification(e.method, e.params);
		}));
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
		this._resolvedExecutable = executable;
		const folders = this.workspaceContextService.getWorkspace().folders;
		const cwd = folders[0]?.uri.fsPath ?? this.environmentService.userHome.fsPath;

		const env = this.runSettingsService.getEnvOverrides();
		this.appendEngineLog(`[start] ${executable}\n[cwd] ${cwd}\n`);
		await this.ipc.start(executable, cwd, env, {
			configuredPath: readDroxExecutableConfiguredPath(this.configurationService, this.productService),
			appRoot: this.environmentService.appRoot,
			workspaceFolderPaths: folders.map(f => f.uri.fsPath),
		});
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
		const init = await this.request('initialize', {
			protocolVersion: '1.0',
			clientName: 'drox-ide',
			clientVersion: '0.1.0',
			clientCapabilities: {
				executableTools: this._clientCapabilities.executableTools,
				interactiveAsk: this._clientCapabilities.interactiveAsk,
			},
		}) as DroxEngineInitializeResult;
		const version = typeof init?.serverVersion === 'string' ? init.serverVersion : '?';
		const pipeline = typeof init?.orchestrationPipeline === 'string' ? init.orchestrationPipeline : '(legacy — rebuild drox or fix drox.executablePath)';
		const devBuild = typeof init?.devBuild === 'number' && Number.isFinite(init.devBuild) && init.devBuild > 0
			? Math.floor(init.devBuild)
			: undefined;
		const gitSha = typeof init?.engineGitSha === 'string' && init.engineGitSha.trim().length > 0
			? init.engineGitSha.trim()
			: undefined;
		this._engineDevBuild = devBuild;
		this._engineGitSha = gitSha;
		const builtAt = devBuild !== undefined ? new Date(devBuild * 1000).toISOString() : '—';
		this.appendEngineLog(
			`[engine] version=${version} devBuild=${devBuild ?? '—'} git=${gitSha ?? '—'} builtAt=${builtAt} pipeline=${pipeline}\n`,
		);
		if (pipeline !== 'role_split' && pipeline !== 'tui_mono') {
			this.appendEngineLog('[warn] Legacy engine — rebuild drox-cli in drox-engine/drox, then set drox.executablePath to target/debug/drox.exe\n');
		}
		this._onDidInitialize.fire(init ?? {});
		return init;
	}

	async request(method: string, params?: unknown): Promise<unknown> {
		const kind = trafficKindForRpc(method);
		const summary = summarizeRpcOut(method, params);
		const destination = method === 'agent.run' || method.startsWith('agent.')
			? this.llmServerDestination()
			: undefined;
		const t0 = Date.now();
		this.trafficService.record({
			direction: 'out',
			kind,
			summary,
			status: 'running',
			destination,
		});
		try {
			const result = await this.ipc.request(method, params);
			this.trafficService.record({
				direction: 'in',
				kind,
				summary: `${summary} ← ok`,
				durationMs: Date.now() - t0,
				status: 'ok',
				detail: summarizeRpcResult(method, result),
				destination,
			});
			return result;
		} catch (err) {
			this.trafficService.record({
				direction: 'in',
				kind,
				summary: `${summary} ← error`,
				durationMs: Date.now() - t0,
				status: 'error',
				detail: err instanceof Error ? err.message : String(err),
				destination,
			});
			throw err;
		}
	}

	private llmServerDestination(): string | undefined {
		const raw = this.configurationService.getValue<string>(DroxSetting.Server);
		if (typeof raw !== 'string' || !raw.trim()) {
			return undefined;
		}
		// Prefer host+path so destination tags can partial-match the configured server URL.
		return destinationFromUrl(raw.trim()) ?? normalizeTrafficDestination(raw);
	}

	async fetchHttp(
		url: string,
		headers?: Record<string, string>,
		options?: { method?: 'GET' | 'POST'; body?: string },
	): Promise<{ statusCode: number; body: string }> {
		const method = options?.method ?? 'GET';
		const destination = destinationFromUrl(url);
		const t0 = Date.now();
		this.trafficService.record({
			direction: 'out',
			kind: 'llm',
			summary: `${method} ${shortUrl(url)}`,
			status: 'running',
			detail: options?.body ? `body ${options.body.length} chars` : undefined,
			destination,
		});
		try {
			const result = await this.ipc.fetchHttp(url, headers, options);
			this.trafficService.record({
				direction: 'in',
				kind: 'llm',
				summary: `${method} ${shortUrl(url)} ← ${result.statusCode}`,
				durationMs: Date.now() - t0,
				status: result.statusCode >= 400 ? 'error' : 'ok',
				detail: `response ${result.body.length} chars`,
				destination,
			});
			return result;
		} catch (err) {
			this.trafficService.record({
				direction: 'in',
				kind: 'llm',
				summary: `${method} ${shortUrl(url)} ← error`,
				durationMs: Date.now() - t0,
				status: 'error',
				detail: err instanceof Error ? err.message : String(err),
				destination,
			});
			throw err;
		}
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
		this._engineDevBuild = undefined;
		this._engineGitSha = undefined;
		this._resolvedExecutable = undefined;
		this._initializePromise = undefined;
		this._clientCapabilities.executableTools = [];
		this._clientCapabilities.interactiveAsk = true;
	}

	private async dispatchServerRequest(id: number | string, method: string, params: unknown): Promise<void> {
		const kind = trafficKindForRpc(method);
		const summary = summarizeRpcIn(method, params);
		const t0 = Date.now();
		this.trafficService.record({
			direction: 'in',
			kind,
			summary,
			status: 'running',
		});
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
		this.trafficService.record({
			direction: 'out',
			kind,
			summary: `${summary} → ${payload.error ? 'error' : 'ok'}`,
			durationMs: Date.now() - t0,
			status: payload.error ? 'error' : 'ok',
			detail: payload.error?.message,
		});
		await this.ipc.respondServerRequest(id, payload);
	}

	private recordTrafficNotification(method: string, params: unknown): void {
		// High-signal notifications only — skip token/stream spam.
		const m = method.toLowerCase();
		if (!(m.includes('error') || m.includes('fail') || m.endsWith('/done') || m.includes('tool') || m === 'agent.event')) {
			return;
		}
		this.trafficService.record({
			direction: 'in',
			kind: trafficKindForRpc(method),
			summary: `notify ${method}`,
			status: m.includes('error') || m.includes('fail') ? 'error' : 'ok',
			detail: summarizeNotificationParams(params),
		});
	}

	private appendEngineLog(text: string): void {
		const channel = this.outputService.getChannel(DROX_OUTPUT_CHANNEL_ID);
		channel?.append(text);
	}
}

function trafficKindForRpc(method: string): DroxTrafficKind {
	const m = method.toLowerCase();
	if (m.includes('tool')) {
		return 'tool';
	}
	if (m.includes('embed') || m.includes('codebase')) {
		return 'embed';
	}
	if (m.includes('mcp')) {
		return 'mcp';
	}
	if (m.startsWith('agent.') || m.includes('llm') || m.includes('chat') || m.includes('completion')) {
		return 'llm';
	}
	return 'rpc';
}

function summarizeRpcOut(method: string, params: unknown): string {
	if (method === 'agent.run') {
		const p = params as { prompt?: string; message?: string; model?: string; architectModel?: string } | undefined;
		const model = typeof p?.model === 'string' ? p.model
			: typeof p?.architectModel === 'string' ? p.architectModel
				: undefined;
		const raw = typeof p?.prompt === 'string' ? p.prompt : typeof p?.message === 'string' ? p.message : undefined;
		const msg = raw?.trim().replace(/\s+/g, ' ').slice(0, 80);
		return `agent.run${model ? ` [${model}]` : ''}${msg ? ` — ${msg}` : ''}`;
	}
	if (method === 'agent.cancel') {
		return 'agent.cancel';
	}
	return method;
}

function summarizeRpcIn(method: string, params: unknown): string {
	if (method === 'tool/exec') {
		const p = params as { toolName?: string } | undefined;
		return `tool/exec ${typeof p?.toolName === 'string' ? p.toolName : '?'}`;
	}
	return method;
}

function summarizeRpcResult(method: string, result: unknown): string | undefined {
	if (method === 'agent.run' && result && typeof result === 'object') {
		const runId = (result as { runId?: unknown }).runId;
		if (typeof runId === 'string') {
			return `runId=${runId}`;
		}
	}
	return undefined;
}

function summarizeNotificationParams(params: unknown): string | undefined {
	if (!params || typeof params !== 'object') {
		return undefined;
	}
	const o = params as Record<string, unknown>;
	const type = typeof o.type === 'string' ? o.type : typeof o.event === 'string' ? o.event : undefined;
	const name = typeof o.name === 'string' ? o.name : typeof o.toolName === 'string' ? o.toolName : undefined;
	const parts = [type, name].filter(Boolean);
	return parts.length ? parts.join(' ') : undefined;
}

function shortUrl(url: string): string {
	try {
		const u = new URL(url);
		return `${u.host}${u.pathname}`;
	} catch {
		return url.length > 80 ? `${url.slice(0, 80)}…` : url;
	}
}
