/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file



import { URI } from '../../../../base/common/uri.js';

import { Emitter, Event } from '../../../../base/common/event.js';

import { Disposable } from '../../../../base/common/lifecycle.js';

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

import { IFileService } from '../../../../platform/files/common/files.js';

import { IDroxFileChangePayload } from './droxFileChange.js';

import { droxChangeEventKey } from './droxChangeEventKey.js';

import { IDroxSessionChangesDetailService } from './droxSessionChangesDetailService.js';

import { readDroxChangesPanelState, writeDroxChangesPanelState } from './droxSessionChangesPanelStore.js';

import { DroxChatSessionUri } from './droxAgentsSession.js';



export const IDroxSessionChangesPanelService = createDecorator<IDroxSessionChangesPanelService>('droxSessionChangesPanelService');



export interface IDroxSessionChangesPanelService {

	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<URI>;

	filterDismissed(sessionResource: URI, events: readonly IDroxFileChangePayload[]): readonly IDroxFileChangePayload[];

	applyPersistedDismissals(sessionResource: URI, engineSessionId: string, workspacePath: string): Promise<void>;

	dismissChanges(sessionResource: URI, engineSessionId: string, workspacePath: string, keys: readonly string[]): Promise<void>;

	cleanAllChanges(sessionResource: URI, engineSessionId: string, workspacePath: string): Promise<void>;

	clearSession(sessionResource: URI): void;

}



export class DroxSessionChangesPanelService extends Disposable implements IDroxSessionChangesPanelService {



	declare readonly _serviceBrand: undefined;



	private readonly _dismissedBySession = new Map<string, Set<string>>();

	private readonly _onDidChange = this._register(new Emitter<URI>());

	readonly onDidChange = this._onDidChange.event;



	constructor(

		@IFileService private readonly fileService: IFileService,

		@IDroxSessionChangesDetailService private readonly detailService: IDroxSessionChangesDetailService,

	) {

		super();

	}



	filterDismissed(sessionResource: URI, events: readonly IDroxFileChangePayload[]): readonly IDroxFileChangePayload[] {

		const dismissed = this._dismissedBySession.get(sessionResource.toString());

		if (!dismissed?.size) {

			return events;

		}

		return events.filter((change, index) => !dismissed.has(droxChangeEventKey(change, index)));

	}



	async applyPersistedDismissals(sessionResource: URI, engineSessionId: string, workspacePath: string): Promise<void> {

		const state = await readDroxChangesPanelState(this.fileService, workspacePath, engineSessionId);

		this._dismissedBySession.set(sessionResource.toString(), new Set(state.dismissedKeys));

		const filtered = this.filterDismissed(sessionResource, this.detailService.getSessionChangeEvents(sessionResource));

		this.detailService.setSessionChangeEvents(sessionResource, filtered);

		this._onDidChange.fire(sessionResource);

	}



	async dismissChanges(sessionResource: URI, engineSessionId: string, workspacePath: string, keys: readonly string[]): Promise<void> {

		if (keys.length === 0) {

			return;

		}

		const sessionKey = sessionResource.toString();

		let dismissed = this._dismissedBySession.get(sessionKey);

		if (!dismissed) {

			dismissed = new Set();

			this._dismissedBySession.set(sessionKey, dismissed);

		}

		for (const key of keys) {

			dismissed.add(key);

		}

		const events = this.detailService.getSessionChangeEvents(sessionResource);

		const keysSet = new Set(keys);

		const next = events.filter((change, index) => !keysSet.has(droxChangeEventKey(change, index)));

		this.detailService.setSessionChangeEvents(sessionResource, next);

		await writeDroxChangesPanelState(this.fileService, workspacePath, engineSessionId, {

			dismissedKeys: [...dismissed],

		});

		this._onDidChange.fire(sessionResource);

	}



	async cleanAllChanges(sessionResource: URI, engineSessionId: string, workspacePath: string): Promise<void> {

		const events = this.detailService.getSessionChangeEvents(sessionResource);

		const keys = events.map((change, index) => droxChangeEventKey(change, index));

		await this.dismissChanges(sessionResource, engineSessionId, workspacePath, keys);

	}



	clearSession(sessionResource: URI): void {

		this._dismissedBySession.delete(sessionResource.toString());

	}



	static parseEngineSessionId(sessionResource: URI): string | undefined {

		return DroxChatSessionUri.parseSessionId(sessionResource);

	}

}


