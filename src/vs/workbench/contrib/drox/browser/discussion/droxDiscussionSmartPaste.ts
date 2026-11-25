/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import { IDroxPasteCandidateService } from '../../common/droxPasteCandidateService.js';
import { toDroxSmartPasteVariableEntry, wireToDroxSmartPasteAttachmentValue, isDroxSmartPasteVariableEntry } from '../../common/droxNativeChatRequestAttachments.js';
import { registerDroxSmartPasteHandler } from '../agents/droxAgentsSmartPaste.js';

/**
 * Collage intelligent du compositeur Drox (1.6.9 `NewChatInput`), branché sur le
 * `ChatWidget` partagé IDE / Agents.
 */
export function attachDroxDiscussionSmartPaste(
	configurationService: IConfigurationService,
	instantiationService: IInstantiationService,
	widget: Pick<IChatWidget, 'input' | 'inputEditor' | 'attachmentModel'>,
	register: (disposable: IDisposable) => void,
): void {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return;
	}
	const host = widget.input.element;
	instantiationService.invokeFunction((accessor: ServicesAccessor) => {
		const pasteCandidateService = accessor.get(IDroxPasteCandidateService);
		register(registerDroxSmartPasteHandler(
			host,
			pasteCandidateService,
			candidate => {
				widget.attachmentModel.addContext(toDroxSmartPasteVariableEntry(
					`drox-paste-${generateUuid()}`,
					wireToDroxSmartPasteAttachmentValue(candidate),
				));
			},
			token => widget.attachmentModel.attachments.some(entry => {
				if (!isDroxSmartPasteVariableEntry(entry)) {
					return false;
				}
				const value = entry.value as { token?: string } | undefined;
				return value?.token === token;
			}),
		));
		const editor = widget.inputEditor;
		if (editor) {
			register(editor.onDidFocusEditorText(() => pasteCandidateService.resync()));
		}
	});
}
