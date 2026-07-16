/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { coerceImageBuffer } from '../../chat/common/chatImageExtraction.js';
import { IGenericChatRequestVariableEntry, IChatRequestVariableEntry, IChatRequestPasteVariableEntry, IImageVariableEntry, isExplicitFileOrImageVariableEntry, isImageVariableEntry, isPasteVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { formatPastesForPrompt, IDroxPasteAttachmentPayload, IDroxPasteCandidateWire, DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL } from './droxPasteCandidates.js';
import { IChatRequestVariableData } from '../../chat/common/model/chatModel.js';
import {
	decodeDataUrl,
	IDroxAgentRunImage,
	IDroxAttachmentPayload,
	prepareImageAttachmentsForRun,
} from './droxAttachments.js';
import { IDroxAttachmentsService } from './droxAttachmentsService.js';
import { formatReferencesPromptBlock, IDroxReferencePayload, resolveDroxReferences } from './droxReferences.js';
import { isVisionRelatedLlmError, formatVisionChatError } from './droxVision.js';

export const DROX_SMART_PASTE_META_KEY = 'droxSmartPaste';

export interface IDroxSmartPasteAttachmentValue {
	readonly token: string;
	readonly kind: 'editor' | 'terminal';
	readonly absPath: string;
	readonly relPath: string | null;
	readonly languageId: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly lineCount: number;
	readonly text: string;
}

export function isDroxSmartPasteVariableEntry(entry: IChatRequestVariableEntry): entry is IGenericChatRequestVariableEntry {
	return entry.kind === 'generic' && entry._meta?.[DROX_SMART_PASTE_META_KEY] === true;
}

function smartPasteValueToPayload(value: unknown): IDroxPasteAttachmentPayload | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const v = value as Partial<IDroxSmartPasteAttachmentValue>;
	if (typeof v.token !== 'string' || typeof v.text !== 'string') {
		return undefined;
	}
	return {
		kind: v.kind === 'terminal' ? 'terminal' : 'editor',
		absPath: typeof v.absPath === 'string' ? v.absPath : undefined,
		relPath: typeof v.relPath === 'string' ? v.relPath : v.relPath === null ? null : undefined,
		languageId: typeof v.languageId === 'string' ? v.languageId : undefined,
		startLine: typeof v.startLine === 'number' ? v.startLine : undefined,
		endLine: typeof v.endLine === 'number' ? v.endLine : undefined,
		lineCount: typeof v.lineCount === 'number' ? v.lineCount : undefined,
		text: v.text,
	};
}

export function wireToDroxSmartPasteAttachmentValue(wire: IDroxPasteCandidateWire): IDroxSmartPasteAttachmentValue {
	return {
		token: wire.token,
		kind: wire.kind,
		absPath: wire.absPath,
		relPath: wire.relPath,
		languageId: wire.languageId,
		startLine: wire.startLine,
		endLine: wire.endLine,
		lineCount: wire.lineCount,
		text: wire.text,
	};
}

export function formatDroxSmartPasteChipLabel(paste: Pick<IDroxSmartPasteAttachmentValue, 'kind' | 'absPath' | 'relPath' | 'startLine' | 'endLine'>): string {
	const lineRef = paste.startLine === paste.endLine
		? `L${paste.startLine}`
		: `L${paste.startLine}-${paste.endLine}`;
	if (paste.kind === 'terminal') {
		const termName = typeof paste.relPath === 'string' && paste.relPath.trim()
			? paste.relPath.trim()
			: 'Terminal';
		return `${termName} · ${lineRef}`;
	}
	const refPath = paste.relPath ?? paste.absPath;
	const base = refPath.replace(/\\/g, '/').split('/').pop() ?? refPath;
	return `${base} · ${lineRef}`;
}

export function toDroxSmartPasteVariableEntry(id: string, paste: IDroxSmartPasteAttachmentValue): IGenericChatRequestVariableEntry {
	return {
		kind: 'generic',
		id,
		name: formatDroxSmartPasteChipLabel(paste),
		value: paste,
		_meta: { [DROX_SMART_PASTE_META_KEY]: true },
	};
}

export function isDroxSendablePasteAttachment(entry: IChatRequestVariableEntry): boolean {
	return isPasteVariableEntry(entry) || isDroxSmartPasteVariableEntry(entry);
}

/** File / paste / smart-paste chips shown above the user message bubble. */
export function isDroxRequestAttachmentTopRow(entry: IChatRequestVariableEntry): boolean {
	return entry.kind === 'file'
		|| entry.kind === 'directory'
		|| isPasteVariableEntry(entry)
		|| isDroxSmartPasteVariableEntry(entry);
}

export function droxSmartPasteVariableEntryToPasteEntry(
	attachment: IGenericChatRequestVariableEntry,
): IChatRequestPasteVariableEntry | undefined {
	if (!isDroxSmartPasteVariableEntry(attachment)) {
		return undefined;
	}
	const value = attachment.value as IDroxSmartPasteAttachmentValue;
	const lineCount = Math.max(1, value.endLine - value.startLine + 1);
	const pastedLines = lineCount === 1
		? localize('pastedAttachment.oneLine', '1 line')
		: localize('pastedAttachment.multipleLines', '{0} lines', lineCount);
	return {
		kind: 'paste',
		id: attachment.id,
		name: attachment.name,
		value: value.text,
		code: value.text,
		language: value.languageId,
		pastedLines,
		fileName: value.kind === 'terminal'
			? (value.relPath ?? 'Terminal')
			: (value.relPath ?? value.absPath),
		copiedFrom: value.kind === 'editor' && value.absPath && value.absPath !== DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL
			? {
				uri: URI.file(value.absPath),
				range: {
					startLineNumber: value.startLine,
					startColumn: 1,
					endLineNumber: value.endLine,
					endColumn: 1,
				},
			}
			: undefined,
	};
}

function standardPasteEntryToPayload(entry: IChatRequestPasteVariableEntry): IDroxPasteAttachmentPayload | undefined {
	const text = typeof entry.code === 'string' ? entry.code : '';
	if (!text.trim()) {
		return undefined;
	}
	const copiedFrom = entry.copiedFrom;
	let absPath = '';
	if (copiedFrom?.uri) {
		absPath = copiedFrom.uri.fsPath;
	} else if (entry.fileName) {
		try {
			absPath = URI.parse(entry.fileName).fsPath;
		} catch {
			absPath = entry.fileName;
		}
	}
	const startLine = copiedFrom?.range.startLineNumber ?? 1;
	const endLine = copiedFrom?.range.endLineNumber ?? startLine;
	return {
		kind: 'editor',
		absPath,
		relPath: null,
		languageId: entry.language || 'plaintext',
		startLine,
		endLine,
		lineCount: Math.max(1, endLine - startLine + 1),
		text,
	};
}

export function extractStandardPastePayloads(variableData: IChatRequestVariableData): IDroxPasteAttachmentPayload[] {
	const payloads: IDroxPasteAttachmentPayload[] = [];
	const seen = new Set<string>();
	for (const variable of variableData.variables) {
		if (!isPasteVariableEntry(variable)) {
			continue;
		}
		const payload = standardPasteEntryToPayload(variable);
		if (!payload) {
			continue;
		}
		const key = `${payload.absPath}|${payload.startLine}|${payload.endLine}|${payload.text}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		payloads.push(payload);
	}
	return payloads;
}

export function extractAllDroxPastePayloads(variableData: IChatRequestVariableData): IDroxPasteAttachmentPayload[] {
	return [
		...extractDroxSmartPastePayloads(variableData),
		...extractStandardPastePayloads(variableData),
	];
}

export function extractDroxSmartPastePayloads(variableData: IChatRequestVariableData): IDroxPasteAttachmentPayload[] {
	const payloads: IDroxPasteAttachmentPayload[] = [];
	for (const variable of variableData.variables) {
		if (!isDroxSmartPasteVariableEntry(variable)) {
			continue;
		}
		const payload = smartPasteValueToPayload(variable.value);
		if (payload) {
			payloads.push(payload);
		}
	}
	return payloads;
}

export function partitionSmartPasteAttachments(entries: readonly IChatRequestVariableEntry[]): {
	readonly context: IChatRequestVariableEntry[];
	readonly smartPastes: IChatRequestVariableEntry[];
} {
	const context: IChatRequestVariableEntry[] = [];
	const smartPastes: IChatRequestVariableEntry[] = [];
	for (const entry of entries) {
		if (isDroxSmartPasteVariableEntry(entry)) {
			smartPastes.push(entry);
		} else {
			context.push(entry);
		}
	}
	return { context, smartPastes };
}

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

/** File / folder pills from the native Agents composer → engine reference block. */
export function extractFileReferencePayloads(variableData: IChatRequestVariableData): IDroxReferencePayload[] {
	const payloads: IDroxReferencePayload[] = [];
	const seen = new Set<string>();
	for (const variable of variableData.variables) {
		if (!isExplicitFileOrImageVariableEntry(variable) || isImageVariableEntry(variable)) {
			continue;
		}
		if (variable.kind !== 'file' && variable.kind !== 'directory') {
			continue;
		}
		const uri = URI.isUri(variable.value) ? variable.value : undefined;
		if (!uri) {
			continue;
		}
		const key = uri.toString();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		payloads.push({ uri: key });
	}
	return payloads;
}

async function appendFileReferencesToPrompt(
	fileService: IFileService,
	workspaceRoot: string,
	variableData: IChatRequestVariableData,
	prompt: string,
): Promise<string> {
	const refPayloads = extractFileReferencePayloads(variableData);
	if (refPayloads.length === 0) {
		return prompt;
	}
	const resolved = await resolveDroxReferences(fileService, workspaceRoot, refPayloads);
	if (resolved.length === 0) {
		return prompt;
	}
	const block = formatReferencesPromptBlock(workspaceRoot, resolved);
	return prompt ? `${prompt}\n\n${block}` : block;
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
	fileService: IFileService,
	options: {
		readonly message: string;
		readonly variables: IChatRequestVariableData;
		readonly workspaceRoot: string;
		readonly modelName?: string;
	},
): Promise<IDroxNativeChatRunPromptResult> {
	let prompt = await appendFileReferencesToPrompt(
		fileService,
		options.workspaceRoot,
		options.variables,
		options.message.trim(),
	);

	const pastePayloads = extractAllDroxPastePayloads(options.variables);
	if (pastePayloads.length > 0) {
		const { promptBlock } = formatPastesForPrompt(pastePayloads, options.workspaceRoot);
		if (promptBlock) {
			prompt = prompt ? `${prompt}\n\n${promptBlock}` : promptBlock;
		}
	}

	const attachmentPayloads = extractImageAttachmentPayloads(options.variables);
	if (attachmentPayloads.length === 0) {
		if (!prompt) {
			return {
				ok: false,
				message: localize('drox.promptEmpty', 'Enter a message or attach a file.'),
			};
		}
		return { ok: true, prompt };
	}
	try {
		const prepared = await prepareImageAttachmentsForRun({
			trimmed: prompt,
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
