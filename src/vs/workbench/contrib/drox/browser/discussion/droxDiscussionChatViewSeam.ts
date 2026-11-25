/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IChatWidget, IChatWidgetViewOptions } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatSessionsService } from '../../../chat/common/chatSessionsService.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatModeKind } from '../../../chat/common/constants.js';
import { getChatSessionType } from '../../../chat/common/model/chatUri.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import {
	droxAgentsChatSessionHasLiveRun,
	evictDroxAgentsChatSessionForReload,
} from '../agents/droxAgentsChatSessionCache.js';
import { DroxSessionLoadingOverlay } from '../droxSessionLoadingOverlay.js';
import { finalizeDroxNativeChatHistoryModel } from '../../common/droxNativeChatHistoryFinalize.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';
import { attachDroxWorkingProgressGrid } from '../chat/droxNativeChatWorkingProgress.js';
import { DROX_NATIVE_CHAT_TEST_IDS } from '../chat/droxNativeChatUiConstants.js';
import {
	createDroxDiscussionChatWidgetOptions,
	pickDroxDiscussionPlaceholder,
} from './droxDiscussionChatWidgetOptions.js';

import './media/droxDiscussionShell.css';
import '../chat/media/droxIdeNativeChat.css';

/**
 * Options Agents `ChatView` : même discussion Drox que l’IDE (`droxNativeComposer`, pickers, ratio transcript).
 * Les champs spécifiques à la fenêtre Agents (sandbox, side chat, comparaisons…) restent ceux de Microsoft.
 */
export function applyDroxDiscussionOptionsToAgentsChatView(
	configurationService: IConfigurationService,
	msOptions: IChatWidgetViewOptions,
): IChatWidgetViewOptions {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return msOptions;
	}
	const drox = createDroxDiscussionChatWidgetOptions('agents');
	return {
		...msOptions,
		...drox,
		rendererOptions: {
			...drox.rendererOptions,
			...msOptions.rendererOptions,
		},
		inputPlaceholder: msOptions.inputPlaceholder ?? pickDroxDiscussionPlaceholder(),
		isSessionsWindow: true,
		firstRequestSummary: msOptions.firstRequestSummary,
		supportsSideChat: msOptions.supportsSideChat,
		renderSecondaryToolbar: msOptions.renderSecondaryToolbar,
		validateInput: msOptions.validateInput,
		sandboxToggleChecked: msOptions.sandboxToggleChecked,
		transcriptTabIndex: msOptions.transcriptTabIndex,
		enableFind: msOptions.enableFind,
		persistentContentHeight: msOptions.persistentContentHeight,
		renderGettingStartedTip: msOptions.renderGettingStartedTip,
		filter: msOptions.filter,
		renderChatPet: msOptions.renderChatPet,
		inputEditorOptions: msOptions.inputEditorOptions,
	};
}

/** Options new-session / new-chat (`SharedChatInputComposer`) : compositeur Drox Agent. */
export function applyDroxDiscussionOptionsToNewSessionComposer(
	configurationService: IConfigurationService,
	msOptions: IChatWidgetViewOptions,
): IChatWidgetViewOptions {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return msOptions;
	}
	const drox = createDroxDiscussionChatWidgetOptions('agents');
	return {
		...drox,
		submitHandler: msOptions.submitHandler,
		hostSubmit: msOptions.hostSubmit,
		deferredNotificationsEnabled: msOptions.deferredNotificationsEnabled,
		ownsDraftVoiceSession: msOptions.ownsDraftVoiceSession,
		sandboxToggleChecked: msOptions.sandboxToggleChecked,
		inputEditorOptions: msOptions.inputEditorOptions,
		renderChatPet: msOptions.renderChatPet,
		renderInputOnTop: false,
		renderFollowups: false,
		renderSecondaryToolbar: true,
		inputPlaceholder: pickDroxDiscussionPlaceholder(),
	};
}

export function isDroxAgentsChatSessionResource(resource: URI): boolean {
	return getChatSessionType(resource) === DROX_CHAT_SESSION_TYPE;
}

export function prepareDroxAgentsChatSessionReload(
	configurationService: IConfigurationService,
	sessionResource: URI,
	chatSessionsService: IChatSessionsService,
	chatService: IChatService,
): void {
	if (!isDroxNativeChatStackEnabled(configurationService) || !isDroxAgentsChatSessionResource(sessionResource)) {
		return;
	}
	evictDroxAgentsChatSessionForReload(sessionResource, chatSessionsService, chatService);
}

export function finalizeDroxAgentsChatModelIfIdle(
	configurationService: IConfigurationService,
	model: IChatModel,
): void {
	if (!isDroxNativeChatStackEnabled(configurationService) || !isDroxAgentsChatSessionResource(model.sessionResource)) {
		return;
	}
	if (!droxAgentsChatSessionHasLiveRun(model)) {
		finalizeDroxNativeChatHistoryModel(model);
	}
}

export function bindDroxAgentsChatWidgetToSession(
	configurationService: IConfigurationService,
	widget: Pick<IChatWidget, 'input'>,
	sessionResource: URI,
): void {
	if (!isDroxNativeChatStackEnabled(configurationService) || !isDroxAgentsChatSessionResource(sessionResource)) {
		return;
	}
	widget.input.setChatMode(ChatModeKind.Agent, false);
}

export function showDroxAgentsChatLoadProgress(
	configurationService: IConfigurationService,
	sessionResource: URI,
	loadPromise: Promise<unknown>,
	overlay: DroxSessionLoadingOverlay | undefined,
	showProgressWhile: (promise: Promise<unknown>, delayMs: number) => void,
	delayMs: number,
): void {
	if (isDroxNativeChatStackEnabled(configurationService) && isDroxAgentsChatSessionResource(sessionResource) && overlay) {
		void overlay.showWhile(loadPromise);
		return;
	}
	showProgressWhile(loadPromise, delayMs);
}

export function bindDroxAgentsNewSessionComposer(
	configurationService: IConfigurationService,
	widget: Pick<IChatWidget, 'input' | 'scopedContextKeyService'>,
	register: (d: IDisposable) => void,
): void {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return;
	}
	widget.input.setChatMode(ChatModeKind.Agent, false);
	const chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(widget.scopedContextKeyService);
	chatModeKindKey.set(ChatModeKind.Agent);
	register(toDisposable(() => chatModeKindKey.reset()));
}

/** Classe shell + grille run — partagé IDE / Agents. */
export function mountDroxDiscussionShellOnChatHost(
	configurationService: IConfigurationService,
	host: HTMLElement,
): IDisposable | undefined {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return undefined;
	}
	host.classList.add('drox-discussion-shell');
	host.setAttribute('data-testid', DROX_NATIVE_CHAT_TEST_IDS.discussionShell);
	return attachDroxWorkingProgressGrid(host);
}