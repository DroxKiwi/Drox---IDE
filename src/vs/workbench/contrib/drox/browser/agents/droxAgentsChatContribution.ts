/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import {
	ChatSessionsExtensions,
	IAsyncChatSessionActivationRegistry,
	IChatSessionsService,
} from '../../../chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import {
	DROX_AGENT_ID,
	DROX_CHAT_SESSION_TYPE,
} from '../../common/droxAgentsSession.js';
import { DroxAgentsLanguageModelProvider, droxAgentsLanguageModelVendorDescriptor } from './droxAgentsLanguageModelProvider.js';
import { DroxAgentsSessionHandler } from './droxAgentsSessionHandler.js';
import { registerDroxAgentsFileOpenActions } from './droxAgentsFileOpenActions.js';
import { registerDroxIdeSessionHandoffActions } from './droxIdeSessionHandoffActions.js';
import { registerDroxChatCancelRestoreAction } from '../chat/droxChatCancelRestore.js';
import './droxAgentsChatUiStatsService.js';
import './droxNativeFileChangeScrollContribution.js';

Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
	matchSessionType: sessionType => sessionType === DROX_CHAT_SESSION_TYPE,
	waitForActivation: async (accessor: ServicesAccessor) => {
		return isDroxNativeChatStackEnabled(accessor.get(IConfigurationService));
	},
});

class DroxAgentsChatContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxAgentsChat';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
	) {
		super();

		if (!isDroxNativeChatStackEnabled(configurationService)) {
			return;
		}

		registerDroxChatCancelRestoreAction();

		const store = this._register(new DisposableStore());

		store.add(chatSessionsService.registerChatSessionContribution({
			type: DROX_CHAT_SESSION_TYPE,
			name: DROX_AGENT_ID,
			displayName: localize('droxAgents.sessionDisplayName', 'Drox'),
			description: localize('droxAgents.sessionDescription', 'Agent runs powered by drox.exe'),
			canDelegate: false,
			requiresCustomModels: true,
			supportsAutoModel: false,
			supportsDelegation: false,
			capabilities: {
				// Enables request edit + truncate-on-resubmit (stop/edit UX, 1.5.18 F1).
				supportsCheckpoints: true,
				supportsPromptAttachments: false,
				supportsImageAttachments: true,
			},
		}));

		const sessionHandler = store.add(instantiationService.createInstance(DroxAgentsSessionHandler));
		store.add(chatSessionsService.registerChatSessionContentProvider(DROX_CHAT_SESSION_TYPE, sessionHandler));

		registerDroxAgentsFileOpenActions();
		registerDroxIdeSessionHandoffActions();

		const vendor = droxAgentsLanguageModelVendorDescriptor();
		languageModelsService.deltaLanguageModelChatProviderDescriptors([vendor], []);
		store.add(toDisposable(() => languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendor])));

		const modelProvider = store.add(instantiationService.createInstance(DroxAgentsLanguageModelProvider));
		store.add(languageModelsService.registerLanguageModelProvider(vendor.vendor, modelProvider));
	}
}

registerWorkbenchContribution2(
	DroxAgentsChatContribution.ID,
	DroxAgentsChatContribution,
	WorkbenchPhase.BlockRestore,
);
