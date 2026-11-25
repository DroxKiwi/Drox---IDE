/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import {
	droxToolsSurfaceRead,
	droxToolsSurfaceWrite,
	IDroxToolsSurfaceState,
	isDroxCustomToolsSurfaceActive,
} from '../common/droxToolsSurfaceStore.js';
import { IDroxToolsSurfaceService } from '../common/droxToolsSurfaceService.js';

export class DroxToolsSurfaceService extends Disposable implements IDroxToolsSurfaceService {
	declare readonly _serviceBrand: undefined;

	private readonly _cache = new Map<string, IDroxToolsSurfaceState>();
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
	) {
		super();
	}

	getStateForWorkspace(workspaceFsPath: string): IDroxToolsSurfaceState {
		if (!workspaceFsPath) {
			return { customActive: false, enabled: [] };
		}
		return this._cache.get(workspaceFsPath) ?? { customActive: false, enabled: [] };
	}

	isCustomActive(workspaceFsPath: string): boolean {
		return isDroxCustomToolsSurfaceActive(this.getStateForWorkspace(workspaceFsPath));
	}

	async reload(workspaceFsPath: string): Promise<void> {
		if (!workspaceFsPath) {
			return;
		}
		const state = await droxToolsSurfaceRead(this.fileService, workspaceFsPath);
		this._cache.set(workspaceFsPath, state);
		this._onDidChange.fire();
	}

	async persist(workspaceFsPath: string, state: IDroxToolsSurfaceState): Promise<void> {
		await droxToolsSurfaceWrite(this.fileService, workspaceFsPath, state);
		this._cache.set(workspaceFsPath, state);
		this._onDidChange.fire();
	}

	async clearCustom(workspaceFsPath: string): Promise<void> {
		const cleared: IDroxToolsSurfaceState = { customActive: false, enabled: [] };
		await droxToolsSurfaceWrite(this.fileService, workspaceFsPath, cleared);
		this._cache.set(workspaceFsPath, cleared);
		this._onDidChange.fire();
	}
}