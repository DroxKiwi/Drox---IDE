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
import { RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_HOST_ENABLED_SETTING } from '../../chat/electron-browser/tunnelHost.contribution.js';
import { DROX_THINKING_PHRASES } from './droxThinkingPhrases.js';

const DROX_THINKING_PHRASES_DEFAULT = {
	mode: 'replace' as const,
	phrases: [...DROX_THINKING_PHRASES],
};

/**
 * Overrides de défauts produit Drox (chargé après `chat.shared.contribution`).
 * Active la fenêtre Agents Drox (`drox.exe`) ; garde Copilot / surfaces Microsoft désactivées.
 */
export function registerDroxProductDefaultsConfiguration(): void {
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
		id: 'droxProductDefaults',
		order: 1,
		properties: {
			[ChatConfiguration.AgentEnabled]: {
				type: 'boolean',
				default: true,
				description: localize(
					'drox.product.chatAgentEnabled',
					'When enabled, VS Code Agent mode and the separate Agents window are available. Enabled by default in Drox IDE (Drox engine, not GitHub Copilot).',
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
			'chat.mcp.gallery.enabled': {
				type: 'boolean',
				default: true,
				description: localize(
					'drox.product.mcpGalleryEnabled',
					'Enable the MCP marketplace in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'chat.mcp.gallery.version': {
				type: 'string',
				default: 'v0.1',
				description: localize(
					'drox.product.mcpGalleryVersion',
					'MCP gallery API version for custom registry URLs.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[RemoteAgentHostsEnabledSettingId]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.remoteAgentHostsEnabled',
					'Enable connecting to remote agent hosts. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[RemoteAgentHostAutoConnectSettingId]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.remoteAgentHostsAutoConnect',
					'Automatically connect to remote agent hosts on startup. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[TUNNEL_HOST_ENABLED_SETTING]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.tunnelHostEnabled',
					'Allow remote access to local agent sessions via dev tunnels (Copilot). Disabled by default in Drox IDE.',
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
			'github.copilot.chat.otel.enabled': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.copilotOtelEnabled',
					'OpenTelemetry export from the Copilot extension. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'workbench.enableExperiments': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.enableExperiments',
					'Microsoft experimentation service for feature rollouts. Disabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.TitleBarSignInEnabled]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.titleBarSignIn',
					'Copilot Sign In button in the title bar. Hidden by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.TitleBarOpenInAgentsWindowEnabled]: {
				type: 'boolean',
				default: true,
				description: localize(
					'drox.product.openInAgentsWindow',
					'Show the Open in Agents Window button in the title bar. Enabled by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			'sessions.chat.localAgent.enabled': {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.sessionsLocalAgent',
					'Enable Local VS Code chat sessions (Copilot) in the Agents window. Off by default in Drox IDE.',
				),
				scope: ConfigurationScope.APPLICATION,
			},
			[ChatConfiguration.AIDisabled]: {
				type: 'boolean',
				default: false,
				description: localize(
					'drox.product.disableAIFeatures',
					'Disable and hide built-in GitHub Copilot AI features (chat setup, walkthrough steps, agents banner). Off by default so the Drox Agents window works without extra setup.',
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
			[ChatConfiguration.ThinkingPhrases]: {
				type: 'object',
				default: DROX_THINKING_PHRASES_DEFAULT,
				agentsWindow: {
					default: DROX_THINKING_PHRASES_DEFAULT,
				},
				description: localize(
					'drox.product.thinkingPhrases',
					'Drox loading phrases during agent thinking and tool progress (replaces Copilot defaults).',
				),
				scope: ConfigurationScope.APPLICATION,
			},
		},
	});

	// Garantit le mode replace même si un profil Copilot a laissé mode: append.
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerDefaultConfigurations([{
		overrides: {
			[ChatConfiguration.ThinkingPhrases]: DROX_THINKING_PHRASES_DEFAULT,
		},
		donotCache: true,
		preventExperimentOverride: true,
		source: 'droxProductDefaults',
	}]);
}

/** Doc D1 — URL de remplacement des liens aka.ms dans product.json. */
export { DROX_PRODUCT_NOTICE_URL } from './droxProductUrls.js';
