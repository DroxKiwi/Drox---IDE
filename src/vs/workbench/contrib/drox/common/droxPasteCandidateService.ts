/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDroxPasteCandidateWire } from './droxPasteCandidates.js';

export const IDroxPasteCandidateService = createDecorator<IDroxPasteCandidateService>('droxPasteCandidateService');

export interface IDroxPasteCandidateService {
	readonly _serviceBrand: undefined;
	readonly onDidUpdate: Event<IDroxPasteCandidateWire>;
	resync(): void;
}
