/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { coerceImageBuffer } from '../../chat/common/chatImageExtraction.js';
import { IImageVariableEntry, isImageVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IChatRequestVariableData } from '../../chat/common/model/chatModel.js';
import {
	decodeDataUrl,
	IDroxAgentRunImage,
	IDroxAttachmentPayload,
	prepareImageAttachmentsForRun,
} from './droxAttachments.js';
import { IDroxAttachmentsService } from './droxAttachmentsService.js';
import { isVisionRelatedLlmError, formatVisionChatError } from './droxVision.js';

export function extractImageAttachmentPayloads(variableData: IChatRequestVariableData): IDroxAttachmentPayload[] {
	const payloads: IDroxAttachmentPayload[] = [];
	for (const variable of variableData.variables) {
		if (!isImageVariableEntry(variable)) {
			continue;
		}
		const buffer = coerceImageBuffer(variable.value);
		if (!buffer) {
			continue;
		}
		const mime = variable.mimeType ?? 'image/png';
		payloads.push({
			name: variable.name,
			mime,
			dataUrl: `data:${mime};base64,${encodeBase64(VSBuffer.wrap(buffer))}`,
		});
	}
	return payloads;
}

export function uiReplayImagesToVariableData(
	images: readonly { readonly relPath: string; readonly dataUrl: string }[],
): IChatRequestVariableData | undefined {
	const variables: IImageVariableEntry[] = [];
	for (const img of images) {
		const decoded = decodeDataUrl(img.dataUrl);
		if (!decoded) {
			continue;
		}
		const name = img.relPath || 'image';
		variables.push({
			id: `drox-replay-${generateUuid()}`,
			name,
			fullName: name,
			kind: 'image',
			value: decoded.bytes,
			mimeType: decoded.mime,
		});
	}
	return variables.length > 0 ? { variables } : undefined;
}

export type IDroxNativeChatRunPromptResult =
	| { readonly ok: true; readonly prompt: string; readonly images?: readonly IDroxAgentRunImage[] }
	| { readonly ok: false; readonly message: string };

export async function prepareDroxNativeChatRunPrompt(
	attachmentsService: IDroxAttachmentsService,
	options: {
		readonly message: string;
		readonly variables: IChatRequestVariableData;
		readonly workspaceRoot: string;
		readonly modelName?: string;
	},
): Promise<IDroxNativeChatRunPromptResult> {
	const trimmed = options.message.trim();
	const attachmentPayloads = extractImageAttachmentPayloads(options.variables);
	if (attachmentPayloads.length === 0) {
		return { ok: true, prompt: trimmed };
	}
	try {
		const prepared = await prepareImageAttachmentsForRun({
			trimmed,
			workspaceRoot: options.workspaceRoot,
			attachments: attachmentPayloads,
			persist: atts => attachmentsService.persistAttachments(options.workspaceRoot, atts),
		});
		if (!prepared) {
			return {
				ok: false,
				message: localize('drox.attachmentsEmpty', 'No valid images to send.'),
			};
		}
		return {
			ok: true,
			prompt: prepared.finalPrompt,
			images: prepared.images,
		};
	} catch (e) {
		const text = e instanceof Error ? e.message : String(e);
		const model = options.modelName ?? '';
		const message = model && isVisionRelatedLlmError(text)
			? formatVisionChatError(model, text)
			: localize('drox.attachmentsFailed', 'Failed to prepare images: {0}', text);
		return { ok: false, message };
	}
}
