/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ChatViewContainerId } from '../../chat/browser/chat.js';
import { ChatConfiguration } from '../../chat/common/constants.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { isDroxMicrosoftAgentsSurfaceEnabled } from '../common/droxMicrosoftAgentsSurface.js';

/**
 * Masque les surfaces Agents / chat VS Code quand `droxMicrosoftAgentsSurfaceEnabled` ≠ true.
 * Réactivation : voir D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md
 */
class DroxMicrosoftAgentsSurfaceContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxMicrosoftAgentsSurface';

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IViewsService viewsService: IViewsService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		if (isDroxMicrosoftAgentsSurfaceEnabled(productService)) {
			return;
		}
		const apply = (key: string, value: unknown) => {
			configurationService.updateValue(key, value, ConfigurationTarget.APPLICATION);
		};
		// D1 — Agents / chat VS Code off
		chatEntitlementService.setForceHidden(true);
		apply(ChatConfiguration.AgentEnabled, false);
		apply(ChatConfiguration.GeneralPurposeAgentEnabled, false);
		apply(ChatConfiguration.AgentStatusEnabled, 'hidden');
		apply(ChatConfiguration.UnifiedAgentsBar, false);
		apply(ChatConfiguration.ChatViewSessionsEnabled, false);
		apply('workbench.startupEditor', 'none');
		apply('github.copilot.enable', false);
		// D1.3 — Welcome sans Copilot (walkthrough steps, onboarding overlay, agents banner)
		apply(ChatConfiguration.AIDisabled, true);
		apply('workbench.welcomePage.experimentalOnboarding', false);
		apply('workbench.welcomePage.walkthroughs.openOnInstall', false);
		apply('settingsSync.enable', false);
		void viewsService.closeViewContainer(ChatViewContainerId);
	}
}

registerWorkbenchContribution2(
	DroxMicrosoftAgentsSurfaceContribution.ID,
	DroxMicrosoftAgentsSurfaceContribution,
	WorkbenchPhase.BlockRestore,
);
