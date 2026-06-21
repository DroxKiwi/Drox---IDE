/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { extname, join } from '../../../../base/common/path.js';
import { normalizeImageBase64Payload } from './droxVision.js';

export interface IDroxAttachmentPayload {
	readonly name?: string;
	readonly mime?: string;
	readonly dataUrl?: string;
}

export interface IDroxAgentRunImage {
	readonly mime: string;
	readonly data: string;
	readonly relPath?: string;
	readonly absPath?: string;
}

export interface IDroxPersistedAttachment {
	readonly relPath: string;
	readonly mime: string;
	readonly base64: string;
}

export function sanitizeAttachmentFileName(name: string): string {
	const base = (name || 'image').replace(/[^a-zA-Z0-9._-]+/g, '_');
	return base.length > 64 ? base.slice(0, 64) : base;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

export function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function mimeFromImagePath(path: string): string {
	switch (extname(path).toLowerCase()) {
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.webp':
			return 'image/webp';
		case '.gif':
			return 'image/gif';
		case '.bmp':
			return 'image/bmp';
		default:
			return 'application/octet-stream';
	}
}

/** Build a `data:` URL from file bytes (for webview image attachments). */
export function toImageDataUrl(path: string, data: VSBuffer): string {
	const mime = mimeFromImagePath(path);
	return `data:${mime};base64,${encodeBase64(data)}`;
}

export function extFromImageMime(mime: string): string {
	switch (mime.toLowerCase()) {
		case 'image/png':
			return '.png';
		case 'image/jpeg':
		case 'image/jpg':
			return '.jpg';
		case 'image/webp':
			return '.webp';
		case 'image/gif':
			return '.gif';
		case 'image/bmp':
			return '.bmp';
		default:
			return '';
	}
}

/** Decode `data:<mime>;base64,XXX` (ou variantes avec `;charset=…`) to bytes, or null if invalid. */
export function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
	const trimmed = dataUrl.trim();
	const comma = trimmed.indexOf(',');
	if (comma < 0 || !trimmed.toLowerCase().startsWith('data:')) {
		return null;
	}
	const meta = trimmed.slice(0, comma);
	const payload = trimmed.slice(comma + 1);
	if (!meta.toLowerCase().includes('base64')) {
		return null;
	}
	const mimeMatch = /^data:([^;,]+)/i.exec(meta);
	const mime = mimeMatch?.[1]?.trim() || 'application/octet-stream';
	try {
		return { mime, bytes: decodeBase64(payload).buffer };
	} catch {
		return null;
	}
}

export interface IDroxPreparedImageRun {
	readonly images: readonly IDroxAgentRunImage[];
	readonly savedPaths: readonly string[];
	readonly finalPrompt: string;
	readonly displayed: string;
	readonly userMessageImages: readonly { relPath: string; dataUrl: string }[];
}

export interface IDroxPrepareImageRunInput {
	readonly trimmed: string;
	readonly workspaceRoot: string;
	readonly attachments: readonly IDroxAttachmentPayload[];
	readonly persist: (attachments: readonly IDroxAttachmentPayload[]) => Promise<readonly IDroxPersistedAttachment[]>;
}

/**
 * Persiste les images et prépare le payload `agent.run.images`.
 * @throws si aucune image valide n'a pu être décodée.
 */
export async function prepareImageAttachmentsForRun(input: IDroxPrepareImageRunInput): Promise<IDroxPreparedImageRun | undefined> {
	if (input.attachments.length === 0) {
		return undefined;
	}
	const withData = input.attachments.filter(a => typeof a.dataUrl === 'string' && a.dataUrl.trim().length > 0);
	if (withData.length === 0) {
		throw new Error('Image attachment has no data (missing dataUrl).');
	}
	const persisted = await input.persist(withData);
	if (persisted.length === 0) {
		throw new Error('No images could be decoded. Use PNG, JPEG, WebP, or GIF.');
	}
	if (persisted.length < withData.length) {
		throw new Error(`Only ${persisted.length} of ${withData.length} image(s) could be saved.`);
	}
	const images = persistedToAgentRunImages(persisted, input.workspaceRoot);
	const savedPaths = persisted.map(p => p.relPath);
	const formatted = formatPromptWithImages(input.trimmed, savedPaths);
	const userMessageImages: { relPath: string; dataUrl: string }[] = [];
	for (let i = 0; i < persisted.length; i++) {
		const att = withData[i];
		if (att?.dataUrl) {
			userMessageImages.push({ relPath: persisted[i].relPath, dataUrl: att.dataUrl });
		}
	}
	return {
		images,
		savedPaths,
		finalPrompt: formatted.finalPrompt,
		displayed: formatted.displayed,
		userMessageImages,
	};
}

export function formatPromptWithImages(trimmed: string, savedPaths: readonly string[]): { finalPrompt: string; displayed: string } {
	if (savedPaths.length === 0) {
		return { finalPrompt: trimmed, displayed: trimmed };
	}
	const list = savedPaths.map(p => `- ${p}`).join('\n');
	const finalPrompt = trimmed
		? `${trimmed}\n\n[Attached images]\n${list}`
		: `[Attached images]\n${list}`;
	const tail = savedPaths.length === 1 ? '1 image' : `${savedPaths.length} images`;
	const displayed = trimmed
		? `${trimmed}\n📎 ${tail} attached`
		: `📎 ${tail} attached`;
	return { finalPrompt, displayed };
}

export function persistedToAgentRunImages(
	persisted: readonly IDroxPersistedAttachment[],
	workspaceRoot?: string,
): IDroxAgentRunImage[] {
	return persisted.map(p => {
		const relPath = p.relPath;
		const absPath = workspaceRoot
			? join(workspaceRoot, relPath.replace(/^\.\//, '')).replaceAll('\\', '/')
			: undefined;
		return { mime: p.mime, data: normalizeImageBase64Payload(p.base64), relPath, absPath };
	});
}
