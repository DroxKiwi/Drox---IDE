/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stringHash } from '../../../../../base/common/hash.js';

export interface IDroxCodebaseChunk {
	readonly id: string;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly contentHash: string;
	readonly text: string;
}

const DEFAULT_WINDOW_LINES = 80;
const DEFAULT_OVERLAP_LINES = 10;

/**
 * Split file text into overlapping line windows (CB1 — no AST yet).
 */
export function droxCodebaseChunkText(
	relativePath: string,
	text: string,
	windowLines: number = DEFAULT_WINDOW_LINES,
	overlapLines: number = DEFAULT_OVERLAP_LINES,
): IDroxCodebaseChunk[] {
	const normalized = text.replace(/\r\n/g, '\n');
	const lines = normalized.length === 0 ? [] : normalized.split('\n');
	if (lines.length === 0) {
		return [];
	}

	const step = Math.max(1, windowLines - overlapLines);
	const chunks: IDroxCodebaseChunk[] = [];

	for (let start = 0; start < lines.length; start += step) {
		const end = Math.min(lines.length, start + windowLines);
		const slice = lines.slice(start, end).join('\n');
		const startLine = start + 1;
		const endLine = end;
		const contentHash = String(stringHash(slice, 0));
		chunks.push({
			id: `${relativePath}:${startLine}-${endLine}:${contentHash}`,
			path: relativePath,
			startLine,
			endLine,
			contentHash,
			text: slice,
		});
		if (end >= lines.length) {
			break;
		}
	}

	return chunks;
}
