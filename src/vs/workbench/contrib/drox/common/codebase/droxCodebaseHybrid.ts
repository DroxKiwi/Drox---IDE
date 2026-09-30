/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseHit } from './droxCodebaseTypes.js';
import { cosineSimilarity } from './droxCodebaseEmbedPaths.js';

export interface IDroxCodebaseVectorRow {
	readonly chunkId: string;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly preview: string;
	readonly values: readonly number[];
}

/**
 * Fuse lexical hits with vector cosine scores (RRF-ish: sum of ranks).
 */
export function droxCodebaseHybridMerge(
	lexical: readonly IDroxCodebaseHit[],
	queryVector: readonly number[],
	vectorRows: readonly IDroxCodebaseVectorRow[],
	maxResults: number = 12,
): IDroxCodebaseHit[] {
	const scoreMap = new Map<string, { hit: IDroxCodebaseHit; score: number }>();

	lexical.forEach((hit, i) => {
		const key = `${hit.path}:${hit.startLine}`;
		scoreMap.set(key, { hit, score: 1 / (60 + i) + hit.score * 0.01 });
	});

	const vectorScored = vectorRows
		.map(row => ({
			row,
			sim: cosineSimilarity(queryVector, row.values),
		}))
		.filter(x => x.sim > 0.05)
		.sort((a, b) => b.sim - a.sim);

	vectorScored.forEach((item, i) => {
		const key = `${item.row.path}:${item.row.startLine}`;
		const hit: IDroxCodebaseHit = {
			path: item.row.path,
			startLine: item.row.startLine,
			endLine: item.row.endLine,
			score: item.sim,
			preview: item.row.preview,
		};
		const prev = scoreMap.get(key);
		const add = 1 / (60 + i) + item.sim;
		if (prev) {
			scoreMap.set(key, { hit: prev.hit, score: prev.score + add });
		} else {
			scoreMap.set(key, { hit, score: add });
		}
	});

	return [...scoreMap.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, maxResults)
		.map(x => ({ ...x.hit, score: Math.round(x.score * 1000) / 1000 }));
}
