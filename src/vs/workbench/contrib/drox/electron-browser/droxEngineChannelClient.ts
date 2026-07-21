/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import {
	DroxEngineCommand,
	DroxEngineEvent,
	IDroxFetchHttpResult,
	IDroxEngineErrorPayload,
	IDroxEngineExitPayload,
	IDroxEngineLogPayload,
	IDroxEngineNotificationPayload,
	IDroxEngineRespondArgs,
	IDroxEngineServerRequestPayload,
	IDroxEngineStartArgs,
} from '../common/droxIpc.js';

export class DroxEngineChannelClient extends Disposable {

	private readonly windowId: number;

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

	constructor(
		private readonly channel: IChannel,
		windowId: number,
	) {
		super();
		this.windowId = windowId;

		const filterWindow = <T extends { windowId: number }>(e: T): boolean => e.windowId === this.windowId;

		this._register(this.channel.listen<IDroxEngineLogPayload>(DroxEngineEvent.OnLog)(e => {
			if (filterWindow(e)) {
				this._onLog.fire(e);
			}
		}));

		this._register(this.channel.listen<IDroxEngineNotificationPayload>(DroxEngineEvent.OnNotification)(e => {
			if (filterWindow(e)) {
				this._onNotification.fire(e);
			}
		}));

		this._register(this.channel.listen<IDroxEngineServerRequestPayload>(DroxEngineEvent.OnServerRequest)(e => {
			if (filterWindow(e)) {
				this._onServerRequest.fire(e);
			}
		}));

		this._register(this.channel.listen<IDroxEngineExitPayload>(DroxEngineEvent.OnExit)(e => {
			if (filterWindow(e)) {
				this._onExit.fire(e);
			}
		}));

		this._register(this.channel.listen<IDroxEngineErrorPayload>(DroxEngineEvent.OnError)(e => {
			if (filterWindow(e)) {
				this._onError.fire(e);
			}
		}));
	}

	start(
		executable: string,
		cwd: string,
		env?: Record<string, string>,
		resolveHints?: IDroxEngineStartArgs['resolveHints'],
	): Promise<void> {
		return this.channel.call(DroxEngineCommand.Start, {
			windowId: this.windowId,
			executable,
			cwd,
			env,
			resolveHints,
		});
	}

	request(method: string, params?: unknown): Promise<unknown> {
		return this.channel.call(DroxEngineCommand.Request, {
			windowId: this.windowId,
			method,
			params,
		});
	}

	fetchHttp(
		url: string,
		headers?: Record<string, string>,
		options?: { method?: 'GET' | 'POST'; body?: string },
	): Promise<IDroxFetchHttpResult> {
		return this.channel.call(DroxEngineCommand.FetchHttp, {
			url,
			headers,
			method: options?.method,
			body: options?.body,
		});
	}

	respondServerRequest(id: number | string, payload: IDroxEngineRespondArgs['payload']): Promise<void> {
		return this.channel.call(DroxEngineCommand.RespondServerRequest, {
			windowId: this.windowId,
			id,
			payload,
		});
	}

	shutdown(): Promise<void> {
		return this.channel.call(DroxEngineCommand.Shutdown, { windowId: this.windowId });
	}

	disposeEngine(): Promise<void> {
		return this.channel.call(DroxEngineCommand.Dispose, { windowId: this.windowId });
	}
}
