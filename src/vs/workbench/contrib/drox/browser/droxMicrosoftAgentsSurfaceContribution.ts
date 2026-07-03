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
import { isDroxAgentsWindowEnabled } from '../common/droxAgentsConfiguration.js';
import { isDroxMicrosoftAgentsSurfaceEnabled } from '../common/droxMicrosoftAgentsSurface.js';
import { RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_HOST_ENABLED_SETTING } from '../../chat/electron-browser/tunnelHost.contribution.js';
import { ITunnelHostService } from '../../chat/common/tunnelHost.js';

/**
 * Masque les surfaces Agents / chat Microsoft quand `droxMicrosoftAgentsSurfaceEnabled` ≠ true.
 * La fenêtre Agents Drox (`drox.exe`) reste activée par défaut (A1).
 * Réactivation surfaces MS : voir D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md
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
		const droxAgentsWindow = isDroxAgentsWindowEnabled(configurationService);
		// D1 — Copilot / entitlement Microsoft off ; fenêtre Agents Drox on par défaut
		chatEntitlementService.setForceHidden(true);
		apply(ChatConfiguration.AgentEnabled, droxAgentsWindow);
		apply(ChatConfiguration.GeneralPurposeAgentEnabled, false);
		apply(ChatConfiguration.AgentStatusEnabled, 'hidden');
		apply(ChatConfiguration.UnifiedAgentsBar, false);
		apply(ChatConfiguration.ChatViewSessionsEnabled, false);
		apply('workbench.startupEditor', 'none');
		apply('github.copilot.enable', false);
		apply(ChatConfiguration.TitleBarSignInEnabled, false);
		// D1.3 — Welcome sans Copilot ; ne pas bloquer la fenêtre Agents Drox
		apply(ChatConfiguration.AIDisabled, !droxAgentsWindow);
		apply('workbench.welcomePage.experimentalOnboarding', false);
		apply('workbench.welcomePage.walkthroughs.openOnInstall', false);
		apply('settingsSync.enable', false);
		apply(RemoteAgentHostsEnabledSettingId, false);
		apply(RemoteAgentHostAutoConnectSettingId, false);
		apply(TUNNEL_HOST_ENABLED_SETTING, false);
		void viewsService.closeViewContainer(ChatViewContainerId);
	}
}

/** Stops any restored Copilot tunnel-host sharing when Drox has remote session access off. */
class DroxTunnelHostShutdownContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxTunnelHostShutdown';

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITunnelHostService tunnelHostService: ITunnelHostService,
	) {
		if (isDroxMicrosoftAgentsSurfaceEnabled(productService)) {
			return;
		}
		if (configurationService.getValue<boolean>(TUNNEL_HOST_ENABLED_SETTING) !== false) {
			return;
		}
		if (tunnelHostService.isSharing) {
			void tunnelHostService.stopSharing();
		}
	}
}

registerWorkbenchContribution2(
	DroxTunnelHostShutdownContribution.ID,
	DroxTunnelHostShutdownContribution,
	WorkbenchPhase.AfterRestored,
);

registerWorkbenchContribution2(
	DroxMicrosoftAgentsSurfaceContribution.ID,
	DroxMicrosoftAgentsSurfaceContribution,
	WorkbenchPhase.BlockRestore,
);
