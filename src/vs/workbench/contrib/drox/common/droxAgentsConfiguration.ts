/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { DroxSetting } from './droxConfiguration.js';

/**
 * Workspace ouvert : repli migration (valeurs IDE pré-1.5.11) + override optionnel modèle Architecte.
 * Les clés connexion / LLM sont lues en USER canonique via {@link readDroxChatConfigurationValue}.
 */
export function droxConfigurationResourceForRead(
	_configurationService: IConfigurationService,
	workspaceResource?: URI,
): URI | undefined {
	return workspaceResource;
}

/** Persiste une clé settings chat Drox au scope utilisateur (IDE, webview, Agents). */
export async function applyDroxConfigurationUpdate(
	configurationService: IConfigurationService,
	key: string,
	value: unknown,
	_workspaceResource?: URI,
): Promise<void> {
	await configurationService.updateValue(key, value, ConfigurationTarget.USER);
}

/** Persiste le modèle architecte (seul point d'écriture USER pour les pickers). */
export async function persistDroxArchitectModelUser(
	configurationService: IConfigurationService,
	model: string,
	_workspaceResource?: URI,
): Promise<void> {
	const trimmed = model.trim();
	if (!trimmed) {
		return;
	}
	await applyDroxConfigurationUpdate(configurationService, DroxSetting.ArchitectModel, trimmed, _workspaceResource);
}

/** Mode permission agent — USER canonique (IDE webview, natif, fenêtre Agents). */
export async function setDroxPermissionModeConfiguration(
	configurationService: IConfigurationService,
	mode: string,
	workspaceResource?: URI,
): Promise<void> {
	await applyDroxConfigurationUpdate(configurationService, DroxSetting.PermissionMode, mode, workspaceResource);
}

/**
 * Lit une clé settings chat Drox : USER canonique, repli workspace si USER absent (migration).
 */
export function readDroxChatConfigurationValue<T>(
	configurationService: IConfigurationService,
	key: string,
	workspaceResource?: URI,
): T | undefined {
	const inspected = configurationService.inspect<T>(key);
	if (!inspected) {
		return undefined;
	}
	if (inspected.userValue !== undefined) {
		return inspected.userValue;
	}
	if (inspected.userLocalValue !== undefined) {
		return inspected.userLocalValue;
	}
	if (inspected.userRemoteValue !== undefined) {
		return inspected.userRemoteValue;
	}
	if (workspaceResource) {
		const ws = configurationService.getValue<T>(key, { resource: workspaceResource });
		if (ws !== undefined) {
			return ws;
		}
	}
	return inspected.defaultValue;
}

export function readDroxChatConfigurationString(
	configurationService: IConfigurationService,
	key: string,
	workspaceResource?: URI,
): string {
	const value = readDroxChatConfigurationValue<string>(configurationService, key, workspaceResource);
	return typeof value === 'string' ? value.trim() : '';
}

function readWorkspaceOnlyConfigString(
	configurationService: IConfigurationService,
	key: string,
	workspaceResource: URI,
): string {
	const inspected = configurationService.inspect<string>(key, { resource: workspaceResource });
	if (inspected?.workspaceValue === undefined) {
		return '';
	}
	const v = inspected.workspaceValue;
	return typeof v === 'string' ? v.trim() : '';
}

/** @deprecated use {@link readDroxChatConfigurationValue} */
export function readDroxAgentsConfigurationValue<T>(
	configurationService: IConfigurationService,
	key: string,
): T | undefined {
	return readDroxChatConfigurationValue<T>(configurationService, key);
}

/** @deprecated use {@link readDroxChatConfigurationString} */
export function readDroxAgentsConfigurationString(
	configurationService: IConfigurationService,
	key: string,
): string {
	return readDroxChatConfigurationString(configurationService, key);
}

/**
 * Modèle Architecte effectif pour les runs : USER canonique, repli workspace legacy si USER absent.
 */
export function readDroxArchitectModelForContext(
	configurationService: IConfigurationService,
	workspaceResource?: URI,
): string {
	const user = readDroxArchitectModelUser(configurationService);
	if (user) {
		return user;
	}
	if (workspaceResource) {
		const wsOverride = readWorkspaceOnlyConfigString(configurationService, DroxSetting.ArchitectModel, workspaceResource)
			|| readWorkspaceOnlyConfigString(configurationService, DroxSetting.Model, workspaceResource);
		if (wsOverride) {
			return wsOverride;
		}
	}
	return '';
}

/** Modèle Architecte persisté au scope USER (source de vérité CFG IDE ↔ Agents). */
export function readDroxArchitectModelUser(configurationService: IConfigurationService): string {
	const read = (key: string) => readDroxChatConfigurationString(configurationService, key);
	const nexusArchitect = `nexus.drox.${DroxSetting.ArchitectModel.slice('drox.'.length)}`;
	const nexusLegacy = `nexus.drox.${DroxSetting.Model.slice('drox.'.length)}`;
	return read(DroxSetting.ArchitectModel)
		|| read(DroxSetting.Model)
		|| read(nexusArchitect)
		|| read(nexusLegacy);
}

/** Active la fenêtre Agents branchée sur `drox.exe` (défaut `true`, reload requis si désactivé). */
export const DROX_AGENTS_WINDOW_ENABLED_SETTING = 'drox.agentsWindow.enabled';

/** Fil chat natif IDE : `ChatWidget` + `drox.exe` (canal nominal depuis 1.5.11). */
export const DROX_IDE_NATIVE_CHAT_TAB_ENABLED_SETTING = 'drox.ideNativeChatTab.enabled';

/** Onglet webview legacy (référence gelée) — désactivé par défaut. */
export const DROX_IDE_LEGACY_WEBVIEW_CHAT_ENABLED_SETTING = 'drox.ideLegacyWebviewChat.enabled';

/** Masque les affordances « Sign In » Copilot (titlebar, compte Agents, etc.). */
export const DroxCopilotSignInHiddenContextKey = new RawContextKey<boolean>('droxCopilotSignInHidden', false);

export const DroxAgentsWindowEnabledContext = ContextKeyExpr.equals(`config.${DROX_AGENTS_WINDOW_ENABLED_SETTING}`, true);

export const DroxIdeNativeChatTabEnabledContext = ContextKeyExpr.equals(`config.${DROX_IDE_NATIVE_CHAT_TAB_ENABLED_SETTING}`, true);

export const DroxIdeLegacyWebviewChatEnabledContext = ContextKeyExpr.equals(`config.${DROX_IDE_LEGACY_WEBVIEW_CHAT_ENABLED_SETTING}`, true);

export const DroxCopilotSignInHiddenContext = ContextKeyExpr.equals(DroxCopilotSignInHiddenContextKey.key, true);

export function isDroxAgentsWindowEnabled(configurationService: IConfigurationService): boolean {
	const value = configurationService.getValue<boolean>(DROX_AGENTS_WINDOW_ENABLED_SETTING);
	if (value === true) {
		return true;
	}
	if (value === false) {
		return false;
	}
	// Agents window bootstraps before Drox config may be registered — default on for Drox builds.
	return true;
}

export function isDroxIdeNativeChatTabEnabled(configurationService: IConfigurationService): boolean {
	const value = configurationService.getValue<boolean>(DROX_IDE_NATIVE_CHAT_TAB_ENABLED_SETTING);
	if (value === false) {
		return false;
	}
	// Default on in Drox IDE (1.5.11+).
	return value === true || value === undefined;
}

export function isDroxIdeLegacyWebviewChatEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(DROX_IDE_LEGACY_WEBVIEW_CHAT_ENABLED_SETTING) === true;
}

/** Stack chat natif Drox (fenêtre Agents et/ou onglet IDE natif). */
export function isDroxNativeChatStackEnabled(configurationService: IConfigurationService): boolean {
	return isDroxAgentsWindowEnabled(configurationService) || isDroxIdeNativeChatTabEnabled(configurationService);
}

/** Fenêtre Agents Drox : pas de compte GitHub / Copilot requis (`drox.exe` local). */
export function shouldSkipDroxSessionsSignIn(productService: Pick<IProductService, 'droxMicrosoftAgentsSurfaceEnabled'>): boolean {
	return productService.droxMicrosoftAgentsSurfaceEnabled !== true;
}

/** Build Drox nominal (provider Drox, pas surfaces Microsoft Agents). */
export function isDroxAgentsProduct(productService: Pick<IProductService, 'droxMicrosoftAgentsSurfaceEnabled'>): boolean {
	return shouldSkipDroxSessionsSignIn(productService);
}
