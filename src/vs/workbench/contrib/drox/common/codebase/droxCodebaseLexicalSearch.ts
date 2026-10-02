/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseChunk } from './droxCodebaseChunker.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';

/**
 * Tokenize a retrieval query (already rewritten by model comprehension when possible).
 * No language stopword lists — RULES §6 / no NL heuristics on user text.
 */
export function droxCodebaseLexicalTokens(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[^a-z0-9_./\\-]+/i)
		.map(t => t.trim())
		.filter(t => t.length >= 2);
}

/**
 * Simple lexical rank: path matches boost + token hits in chunk text.
 */
export function droxCodebaseLexicalSearch(
	chunks: readonly IDroxCodebaseChunk[],
	query: string,
	maxResults: number = 12,
): IDroxCodebaseHit[] {
	const tokens = droxCodebaseLexicalTokens(query);
	if (tokens.length === 0) {
		return [];
	}

	const scored: { chunk: IDroxCodebaseChunk; score: number }[] = [];

	for (const chunk of chunks) {
		const hayPath = chunk.path.toLowerCase();
		const hayText = chunk.text.toLowerCase();
		let score = 0;
		for (const token of tokens) {
			if (hayPath.includes(token)) {
				score += 5;
			}
			const parts = hayText.split(token);
			if (parts.length > 1) {
				score += Math.min(8, parts.length - 1);
			}
		}
		if (score > 0) {
			scored.push({ chunk, score });
		}
	}

	scored.sort((a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path));

	return scored.slice(0, maxResults).map(({ chunk, score }) => ({
		path: chunk.path,
		startLine: chunk.startLine,
		endLine: chunk.endLine,
		score,
		preview: chunk.text.length > 240 ? `${chunk.text.slice(0, 240)}…` : chunk.text,
	}));
}
