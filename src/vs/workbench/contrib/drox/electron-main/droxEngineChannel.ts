/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IDroxBashExecArgs } from '../common/droxBash.js';
import { DroxEngineCommand, DroxEngineEvent, IDroxFetchHttpArgs, IDroxEngineRespondArgs, IDroxEngineStartArgs } from '../common/droxIpc.js';
import { DroxEngineMainService } from './droxEngineMainService.js';

export class DroxEngineChannel implements IServerChannel<string> {

	constructor(private readonly service: DroxEngineMainService) { }

	listen<T>(_ctx: string, event: string): Event<T> {
		switch (event) {
			case DroxEngineEvent.OnLog:
				return this.service.onLog as Event<T>;
			case DroxEngineEvent.OnNotification:
				return this.service.onNotification as Event<T>;
			case DroxEngineEvent.OnServerRequest:
				return this.service.onServerRequest as Event<T>;
			case DroxEngineEvent.OnExit:
				return this.service.onExit as Event<T>;
			case DroxEngineEvent.OnError:
				return this.service.onError as Event<T>;
		}
		throw new Error(`[Drox] Event not found: ${event}`);
	}

	async call<T>(_ctx: string, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case DroxEngineCommand.Start:
				return await this.service.start(arg as IDroxEngineStartArgs) as T;
			case DroxEngineCommand.Request: {
				const a = arg as { windowId: number; method: string; params?: unknown };
				return await this.service.request(a.windowId, a.method, a.params) as T;
			}
			case DroxEngineCommand.RespondServerRequest:
				this.service.respondServerRequest(arg as IDroxEngineRespondArgs);
				return undefined as T;
			case DroxEngineCommand.ExecBash:
				return await this.service.execBash(arg as IDroxBashExecArgs) as T;
			case DroxEngineCommand.FetchHttp:
				return await this.service.fetchHttp(arg as IDroxFetchHttpArgs) as T;
			case DroxEngineCommand.Shutdown:
				return await this.service.shutdown((arg as { windowId: number }).windowId) as T;
			case DroxEngineCommand.Dispose:
				return await this.service.disposeWindow((arg as { windowId: number }).windowId) as T;
			default:
				throw new Error(`[Drox] Call not found: ${command}`);
		}
	}
}
