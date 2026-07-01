/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import {
	IChatMessage,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatProvider,
	ILanguageModelChatRequestOptions,
	ILanguageModelChatInfoOptions,
} from '../../../chat/common/languageModels.js';
import {
	droxLlmSnapshotToLanguageModels,
	DROX_AGENTS_LM_VENDOR,
} from '../../common/droxAgentsModels.js';
import { IDroxLlmModelsService } from '../../common/droxLlmModelsService.js';

export class DroxAgentsLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IDroxLlmModelsService private readonly llmModelsService: IDroxLlmModelsService,
	) {
		super();
		this._register(this.llmModelsService.onDidChange(() => this._onDidChange.fire()));
	}

	async provideLanguageModelChatInfo(_options: ILanguageModelChatInfoOptions, _token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		return [...droxLlmSnapshotToLanguageModels(this.llmModelsService.snapshot)];
	}

	async sendChatRequest(_modelId: string, _messages: IChatMessage[], _from: ExtensionIdentifier | undefined, _options: ILanguageModelChatRequestOptions, _token: CancellationToken): Promise<never> {
		throw new Error('Drox agents-window models do not support direct LM API chat requests');
	}

	async provideTokenCount(_modelId: string, _message: string | IChatMessage, _token: CancellationToken): Promise<number> {
		return 0;
	}
}

export function droxAgentsLanguageModelVendorDescriptor() {
	return {
		vendor: DROX_AGENTS_LM_VENDOR,
		displayName: 'Drox',
		configuration: undefined,
		managementCommand: undefined,
		when: undefined,
	};
}
