/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** `absPath` sentinelle pour une sélection terminal (smart paste). */
export const DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL = '__drox_terminal_selection__';

export const DROX_PASTE_MAX_CANDIDATES = 10;
export const DROX_PASTE_MAX_TEXT_LENGTH = 200_000;

export interface IDroxPasteCandidate {
	readonly id: string;
	readonly kind: 'editor' | 'terminal';
	readonly token: string;
	readonly absPath: string;
	readonly relPath: string | null;
	readonly languageId: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly lineCount: number;
	readonly text: string;
}

export interface IDroxPasteCandidateWire {
	readonly id: string;
	readonly token: string;
	readonly kind: 'editor' | 'terminal';
	readonly relPath: string | null;
	readonly absPath: string;
	readonly languageId: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly lineCount: number;
	readonly text: string;
}

export interface IDroxPasteAttachmentPayload {
	readonly id?: string;
	readonly kind?: 'editor' | 'terminal';
	readonly absPath?: string;
	readonly relPath?: string | null;
	readonly languageId?: string;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly lineCount?: number;
	readonly text?: string;
}

/** Extrait collé affiché comme lien dans le fil utilisateur (webview). */
export interface IDroxUserMessagePasteWire {
	readonly kind: 'editor' | 'terminal';
	readonly absPath: string;
	readonly relPath: string | null;
	readonly startLine: number;
	readonly endLine: number;
	readonly lineCount: number;
}

export function toUserMessagePasteWire(p: IDroxPasteAttachmentPayload): IDroxUserMessagePasteWire | undefined {
	const absPath = typeof p.absPath === 'string' ? p.absPath : '';
	if (!absPath) {
		return undefined;
	}
	const kind = p.kind === 'terminal' ? 'terminal' : 'editor';
	const text = typeof p.text === 'string' ? p.text : '';
	const lineCount =
		typeof p.lineCount === 'number' && p.lineCount > 0
			? Math.floor(p.lineCount)
			: Math.max(1, text.split(/\r?\n/).length);
	const startLine =
		typeof p.startLine === 'number' && p.startLine > 0 ? Math.floor(p.startLine) : 1;
	const endLine =
		typeof p.endLine === 'number' && p.endLine >= startLine
			? Math.floor(p.endLine)
			: startLine + lineCount - 1;
	return {
		kind,
		absPath,
		relPath: typeof p.relPath === 'string' ? p.relPath : null,
		startLine,
		endLine,
		lineCount,
	};
}

export function normalizePasteText(text: string): string {
	return text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
}

/** Hash 32-bit FNV-1a (hex, 8 chars) — must match webview. */
export function droxFnv1a32(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

export function toPasteCandidateWire(c: IDroxPasteCandidate): IDroxPasteCandidateWire {
	return {
		id: c.id,
		token: c.token,
		kind: c.kind,
		relPath: c.relPath,
		absPath: c.absPath,
		languageId: c.languageId,
		startLine: c.startLine,
		endLine: c.endLine,
		lineCount: c.lineCount,
		text: c.text,
	};
}

export function formatPastesForPrompt(
	pastes: readonly IDroxPasteAttachmentPayload[],
	workspaceRoot: string,
): { promptBlock: string; displayLines: string[] } {
	const blocks: string[] = [];
	const displayLines: string[] = [];
	const INLINE_MAX_LINES = 20;
	const INLINE_MAX_CHARS = 4_000;

	for (const p of pastes) {
		const text = typeof p.text === 'string' ? p.text : '';
		const kind = p.kind === 'terminal' ? 'terminal' : 'editor';
		const lineCount =
			typeof p.lineCount === 'number' && p.lineCount > 0
				? Math.floor(p.lineCount)
				: Math.max(1, text.split(/\r?\n/).length);
		const startLine =
			typeof p.startLine === 'number' && p.startLine > 0
				? Math.floor(p.startLine)
				: 1;
		const endLine =
			typeof p.endLine === 'number' && p.endLine >= startLine
				? Math.floor(p.endLine)
				: startLine + lineCount - 1;
		const lang = typeof p.languageId === 'string' ? p.languageId : 'plaintext';
		const absPath = typeof p.absPath === 'string' ? p.absPath : '';
		const lineRef =
			startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;

		if (kind === 'terminal') {
			const termName =
				typeof p.relPath === 'string' && p.relPath.trim()
					? p.relPath.trim()
					: 'Terminal';
			if (text) {
				blocks.push(
					`**Smart paste (terminal)** — \`${termName}\` (${lineRef}, ${lineCount} l.) :\n` +
					'```shellsession\n' +
					text.replace(/\r\n/g, '\n') +
					(text.endsWith('\n') ? '' : '\n') +
					'```',
				);
			}
			displayLines.push(`⌨ ${termName} · ${lineRef}`);
			continue;
		}

		const fallbackRel = typeof p.relPath === 'string' ? p.relPath : null;
		const rel = (() => {
			if (fallbackRel) {
				return fallbackRel.replace(/^\.\//, '');
			}
			if (!absPath || absPath === DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL) {
				return null;
			}
			const ws = workspaceRoot.replaceAll('\\', '/');
			const abs = absPath.replaceAll('\\', '/');
			if (abs === ws || abs.startsWith(ws + '/')) {
				return abs.slice(ws.length).replace(/^\/+/, '');
			}
			return null;
		})();
		const refPath = rel ?? absPath;
		const readPath = rel ?? absPath;
		const small =
			lineCount <= INLINE_MAX_LINES && text.length <= INLINE_MAX_CHARS;

		if (small && text) {
			const fenceLang = `${lang}:${startLine}-${endLine}:${refPath}`;
			blocks.push(
				`**Smart paste** — \`${refPath}\` (${lineRef}, ${lineCount} lines):\n` +
				'```' +
				fenceLang +
				'\n' +
				text.replace(/\r\n/g, '\n') +
				(text.endsWith('\n') ? '' : '\n') +
				'```',
			);
		} else {
			blocks.push(
				`**Smart paste** (reference) — \`${refPath}\` (${lineRef}, ${lineCount} lines). ` +
				`Call \`file_read\` on \`${readPath}\` ` +
				`(lines ${startLine} to ${endLine}) to read the snippet — do not invent the content.`,
			);
		}
		displayLines.push(`📄 ${refPath} · ${lineRef}`);
	}

	const promptBlock = blocks.length
		? `[Smart paste — user-selected snippets]\n${blocks.join('\n\n')}`
		: '';
	return { promptBlock, displayLines };
}
