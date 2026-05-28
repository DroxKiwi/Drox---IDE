/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDroxRefsBridgeService = createDecorator<IDroxRefsBridgeService>('droxRefsBridgeService');

export interface IDroxRefsBridgeService {
	readonly _serviceBrand: undefined;
	readonly onAppendReferences: Event<readonly string[]>;
	postReferences(uris: readonly string[]): void;
}
