/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { IDroxComposerBridgeService, IDroxPrefillPromptRequest } from '../common/droxComposerBridgeService.js';

export class DroxComposerBridgeService implements IDroxComposerBridgeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onPrefillPrompt = new Emitter<IDroxPrefillPromptRequest>();
	readonly onPrefillPrompt = this._onPrefillPrompt.event;

	private readonly _onRequestNewChat = new Emitter<void>();
	readonly onRequestNewChat = this._onRequestNewChat.event;

	prefillPrompt(text: string, replace?: boolean): void {
		const trimmed = text.trim();
		if (!trimmed) {
			return;
		}
		this._onPrefillPrompt.fire({ text: trimmed, replace });
	}

	requestNewChat(): void {
		this._onRequestNewChat.fire();
	}
}
