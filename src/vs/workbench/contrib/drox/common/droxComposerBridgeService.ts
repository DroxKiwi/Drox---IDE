/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IDroxPrefillPromptRequest {
	readonly text: string;
	readonly replace?: boolean;
}

export const IDroxComposerBridgeService = createDecorator<IDroxComposerBridgeService>('droxComposerBridgeService');

export interface IDroxComposerBridgeService {
	readonly _serviceBrand: undefined;
	readonly onPrefillPrompt: Event<IDroxPrefillPromptRequest>;
	readonly onRequestNewChat: Event<void>;
	prefillPrompt(text: string, replace?: boolean): void;
	requestNewChat(): void;
}
