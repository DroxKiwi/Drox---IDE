/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseHit } from './droxCodebaseTypes.js';

/** Soft default budget for auto-injected codebase context (chars). */
export const DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_CHARS = 5000;
export const DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_HITS = 8;
export const DROX_CODEBASE_FORCE_INJECT_MAX_HITS = 12;

export const DROX_CODEBASE_RETRIEVAL_HINT =
	'Workspace retrieval: for intent / behavior questions prefer the local `@Codebase` index (`codebase_search` tool or injected context). Use `grep` for exact symbol/string literals. Do not confuse with `session_search` (long-term chat memory).';

export interface IDroxCodebaseContextPackResult {
	readonly text: string;
	readonly hitCount: number;
	readonly chars: number;
}

/**
 * Format hybrid/lexical hits into a system-supplement block (CB4).
 * Truncates previews and stops when `maxChars` would be exceeded.
 */
export function formatDroxCodebaseContextBlock(
	hits: readonly IDroxCodebaseHit[],
	opts?: {
		readonly maxChars?: number;
		readonly maxPreviewChars?: number;
		readonly forced?: boolean;
		readonly query?: string;
	},
): IDroxCodebaseContextPackResult | undefined {
	if (!hits.length) {
		return undefined;
	}
	const maxChars = opts?.maxChars ?? DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_CHARS;
	const maxPreview = opts?.maxPreviewChars ?? 320;
	const header = opts?.forced
		? '[Codebase context — user forced]'
		: '[Codebase context — auto]';
	const queryLine = opts?.query?.trim() ? `\nQuery: ${opts.query.trim().slice(0, 200)}` : '';
	const parts: string[] = [`${header}${queryLine}`, '---'];
	let chars = parts.join('\n').length;
	let used = 0;
	for (const hit of hits) {
		const preview = hit.preview.length > maxPreview
			? `${hit.preview.slice(0, maxPreview)}…`
			: hit.preview;
		const block = [
			`### ${hit.path}:${hit.startLine}-${hit.endLine} (score ${hit.score})`,
			preview,
			'',
		].join('\n');
		if (chars + block.length > maxChars && used > 0) {
			break;
		}
		if (chars + block.length > maxChars && used === 0) {
			parts.push(block.slice(0, Math.max(0, maxChars - chars - 1)) + '…');
			used = 1;
			chars = maxChars;
			break;
		}
		parts.push(block);
		chars += block.length;
		used++;
	}
	parts.push('---');
	const text = parts.join('\n').trim();
	return { text, hitCount: used, chars: text.length };
}

export function mergeDroxSystemSupplements(...parts: Array<string | undefined>): string | undefined {
	const merged = parts.map(p => p?.trim()).filter((p): p is string => !!p).join('\n\n');
	return merged.length ? merged : undefined;
}
