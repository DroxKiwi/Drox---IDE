/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extname } from '../../../../../base/common/path.js';
import { IDroxCodebaseHit } from './droxCodebaseTypes.js';

/** Soft max chunks kept per path after merge. */
export const DROX_CODEBASE_RERANK_MAX_PER_PATH = 2;

const CODE_EXT = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
	'.rs', '.py', '.go', '.java', '.kt', '.cs',
	'.css', '.scss', '.vue', '.svelte',
]);

export interface IDroxCodebaseRerankOptions {
	readonly maxPerPath?: number;
	/**
	 * From model comprehension filter only — never inferred from user language.
	 * When true, boost source-like paths / malus README-ish names.
	 */
	readonly preferCodeFiles?: boolean;
	/** From model filter — keep hits under these prefixes when non-empty. */
	readonly pathPrefixes?: readonly string[];
}

/**
 * Post-process hits using **structured filter flags** (model output), not NL heuristics.
 */
export function droxCodebaseRerankHits(
	hits: readonly IDroxCodebaseHit[],
	maxResults: number,
	opts?: IDroxCodebaseRerankOptions,
): IDroxCodebaseHit[] {
	if (!hits.length || maxResults <= 0) {
		return [];
	}
	let list = hits;
	const prefixes = (opts?.pathPrefixes ?? []).map(p => p.replace(/\\/g, '/')).filter(Boolean);
	if (prefixes.length) {
		const filtered = hits.filter(h => {
			const path = h.path.replace(/\\/g, '/');
			return prefixes.some(pre => path === pre || path.startsWith(pre.endsWith('/') ? pre : `${pre}/`) || path.startsWith(pre));
		});
		if (filtered.length) {
			list = filtered;
		}
	}

	const preferCode = opts?.preferCodeFiles === true;
	const maxPerPath = opts?.maxPerPath ?? DROX_CODEBASE_RERANK_MAX_PER_PATH;
	const adjusted = list.map(hit => ({
		hit,
		score: preferCode ? hit.score * pathRankMultiplier(hit.path) : hit.score,
	}));
	adjusted.sort((a, b) => b.score - a.score || a.hit.path.localeCompare(b.hit.path));

	const perPath = new Map<string, number>();
	const out: IDroxCodebaseHit[] = [];
	for (const { hit, score } of adjusted) {
		const n = perPath.get(hit.path) ?? 0;
		if (n >= maxPerPath) {
			continue;
		}
		perPath.set(hit.path, n + 1);
		out.push({
			...hit,
			score: Math.round(score * 1000) / 1000,
		});
		if (out.length >= maxResults) {
			break;
		}
	}
	return out;
}

/** Path multipliers — applied only when model sets preferCodeFiles. */
export function pathRankMultiplier(path: string): number {
	const norm = path.replace(/\\/g, '/');
	const lower = norm.toLowerCase();
	const base = lower.split('/').pop() ?? lower;
	const ext = extname(lower);

	if (/(?:^|\/)(?:readme[^/]*|changelog|license)(?:\.[^/]+)?$/i.test(lower) || lower.includes('/docs/')) {
		return 0.35;
	}
	if (ext === '.md' || ext === '.mdx') {
		return 0.45;
	}

	let m = 1;
	if (
		lower.startsWith('src/') || lower.includes('/src/')
		|| lower.startsWith('app/') || lower.includes('/app/')
		|| lower.includes('/api/') || lower.includes('/lib/')
		|| lower.includes('/components/')
	) {
		m *= 1.55;
	}
	if (CODE_EXT.has(ext)) {
		m *= 1.25;
	}
	if (base.startsWith('route.') || base === 'page.tsx' || base === 'page.ts') {
		m *= 1.15;
	}
	return m;
}
