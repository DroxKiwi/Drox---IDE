/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { IChatWidgetService, IChatWidget } from '../../../chat/browser/chat.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatExecuteActionContext } from '../../../chat/browser/actions/chatExecuteActions.js';
import { DROX_AGENT_ID } from '../../common/droxAgentsSession.js';

function responseHasVisibleContent(widget: IChatWidget): boolean {
	const last = widget.viewModel?.model.lastRequest;
	const response = last?.response;
	if (!response) {
		return false;
	}
	const markdown = response.response.getMarkdown()?.trim() ?? '';
	if (markdown.length > 0) {
		return true;
	}
	return response.response.value.some(part => {
		switch (part.kind) {
			case 'toolInvocation':
			case 'toolInvocationSerialized':
			case 'textEditGroup':
			case 'notebookEditGroup':
			case 'markdownContent':
			case 'treeData':
			case 'progressMessage':
				return true;
			default:
				return false;
		}
	});
}

/**
 * Stop for Drox sessions (1.5.18 F1a/F1b):
 * - No visible model output yet → remove the turn and restore the prompt in the input.
 * - Mid-response → keep the interrupted turn on screen (stock cancel behaviour).
 */
export function registerDroxChatCancelRestoreAction(): void {
	registerAction2(class DroxCancelRestoreAction extends Action2 {
		constructor() {
			super({
				id: 'drox.chat.cancelWithRestore',
				title: localize2('drox.chat.cancel', 'Cancel'),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.stopCircle,
				menu: [{
					id: MenuId.ChatExecute,
					when: ContextKeyExpr.and(
						ChatContextKeys.hasActiveRequest,
						ChatContextKeys.remoteJobCreating.negate(),
						ChatContextKeys.currentlyEditing.negate(),
						ChatContextKeys.lockedCodingAgentId.isEqualTo(DROX_AGENT_ID),
					),
					order: 4,
					group: 'navigation',
				}],
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib + 1,
					primary: KeyMod.CtrlCmd | KeyCode.Escape,
					when: ContextKeyExpr.and(
						ChatContextKeys.hasActiveRequest,
						ChatContextKeys.remoteJobCreating.negate(),
						ChatContextKeys.lockedCodingAgentId.isEqualTo(DROX_AGENT_ID),
					),
					win: { primary: KeyMod.Alt | KeyCode.Backspace },
				},
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			const context = args[0] as IChatExecuteActionContext | undefined;
			const widgetService = accessor.get(IChatWidgetService);
			const chatService = accessor.get(IChatService);
			const widget = context?.widget ?? widgetService.lastFocusedWidget;
			if (!widget?.viewModel) {
				return;
			}

			const sessionResource = widget.viewModel.sessionResource;
			const lastRequest = widget.viewModel.model.lastRequest;
			const messageText = lastRequest?.message.text ?? '';
			const hadVisibleResponse = responseHasVisibleContent(widget);

			await chatService.cancelCurrentRequestForSession(sessionResource, 'droxCancelRestore');

			if (hadVisibleResponse || !lastRequest || !messageText.trim()) {
				return;
			}

			await chatService.removeRequest(sessionResource, lastRequest.id);
			widget.focusInput();
			widget.input.setValue(messageText, false);
		}
	});
}
