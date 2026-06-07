/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import {
	TELEMETRY_CRASH_REPORTER_SETTING_ID,
	TELEMETRY_OLD_SETTING_ID,
	TELEMETRY_SETTING_ID,
	TelemetryConfiguration,
} from '../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration } from '../../chat/common/constants.js';
import { DROX_PRODUCT_NOTICE_URL } from './droxProductUrls.js';

/**
 * Overrides de défauts produit Drox (chargé après `chat.shared.contribution`).
 * Désactive l'écosystème Agents / Copilot VS Code — Drox Chat reste le canal agent.
 */
export function registerDroxProductDefaultsConfiguration(): void {
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
		id: 'droxProductDefaults',
		order: 1,
		properties: {
			[ChatConfiguration.AgentEnabled]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.chatAgentEnabled',
					'When enabled, VS Code Agent mode and the separate Agents window are available. Drox IDE disables this by default; use Drox Chat instead.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.GeneralPurposeAgentEnabled]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.generalPurposeAgentEnabled',
					'When enabled, the built-in general-purpose sub-agent in VS Code chat can run. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'workbench.startupEditor': {
				type: 'string',
				default: 'none',
				description: localize(
					'drox.product.startupEditor',
					'Controls which editor is shown at startup. Drox defaults to no welcome page.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.AgentStatusEnabled]: {
				type: 'string',
				default: 'hidden',
				description: localize(
					'drox.product.chatAgentsControl',
					'Agent status in the title bar. Drox hides Microsoft agent UI by default.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.UnifiedAgentsBar]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.ChatViewSessionsEnabled]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.chatViewSessions',
					'VS Code chat sessions list. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'github.copilot.enable': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.copilotEnable',
					'GitHub Copilot extension completions. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.AIDisabled]: {
				type: 'boolean',
				default: true,
				description: localize(
					'drox.product.disableAIFeatures',
					'Disable and hide built-in GitHub Copilot AI features (chat setup, walkthrough steps, agents banner). Drox Chat remains available.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'workbench.welcomePage.experimentalOnboarding': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.experimentalOnboarding',
					'When enabled, show the Microsoft Copilot sign-in onboarding overlay on first launch. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'workbench.welcomePage.walkthroughs.openOnInstall': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.walkthroughsOpenOnInstall',
					'When enabled, extension walkthroughs open on install. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.MACHINE,
			},
			'settingsSync.enable': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.settingsSync',
					'Sync settings with a Microsoft or GitHub account. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			// D1.5 — Télémétrie Microsoft désactivée par défaut
			[TELEMETRY_SETTING_ID]: {
				type: 'string',
				default: TelemetryConfiguration.OFF,
				description: localize(
					'drox.product.telemetryLevel',
					'Controls Microsoft product telemetry. Drox IDE disables all telemetry by default.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[TELEMETRY_OLD_SETTING_ID]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.enableTelemetry',
					'Legacy telemetry toggle. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[TELEMETRY_CRASH_REPORTER_SETTING_ID]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.enableCrashReporter',
					'Microsoft crash reporter. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
		},
	});
}

/** Doc D1 — URL de remplacement des liens aka.ms dans product.json. */
export { DROX_PRODUCT_NOTICE_URL } from './droxProductUrls.js';
