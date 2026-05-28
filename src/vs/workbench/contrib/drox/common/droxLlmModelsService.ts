/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DroxLlmProviderId } from './droxLlmCatalog.js';

export interface IDroxLlmModelsSnapshot {
	readonly provider: DroxLlmProviderId;
	readonly server: string;
	readonly models: readonly string[];
	readonly selected: string;
	readonly error?: string;
	readonly listUrl?: string;
	readonly loading: boolean;
}

export const IDroxLlmModelsService = createDecorator<IDroxLlmModelsService>('droxLlmModelsService');

export interface IDroxLlmModelsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<IDroxLlmModelsSnapshot>;
	readonly snapshot: IDroxLlmModelsSnapshot;
	refresh(): Promise<void>;
}
