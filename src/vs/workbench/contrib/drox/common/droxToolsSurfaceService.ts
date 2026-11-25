/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { IDroxToolsSurfaceState } from './droxToolsSurfaceStore.js';

export const IDroxToolsSurfaceService = createDecorator<IDroxToolsSurfaceService>('droxToolsSurfaceService');

export interface IDroxToolsSurfaceService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getStateForWorkspace(workspaceFsPath: string): IDroxToolsSurfaceState;
	isCustomActive(workspaceFsPath: string): boolean;
	/** Refresh from disk (or clear cache for workspace). */
	reload(workspaceFsPath: string): Promise<void>;
	persist(workspaceFsPath: string, state: IDroxToolsSurfaceState): Promise<void>;
	clearCustom(workspaceFsPath: string): Promise<void>;
}