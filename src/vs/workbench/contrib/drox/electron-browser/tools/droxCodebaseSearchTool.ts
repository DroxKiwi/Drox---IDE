/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';
import { IDroxCodebaseIndexService } from '../../common/codebase/droxCodebaseIndexService.js';

/**
 * CB3 — `codebase_search` via tool/exec (index local hybrid / lexical).
 */
export function createDroxCodebaseSearchToolHandler(
	indexService: IDroxCodebaseIndexService,
): (params: IDroxToolExecParams) => Promise<IDroxToolExecResult> {
	return async (params: IDroxToolExecParams): Promise<IDroxToolExecResult> => {
		const raw = (params.input ?? {}) as {
			query?: string;
			limit?: number;
			path_prefix?: string;
			pathPrefix?: string;
		};
		const query = typeof raw.query === 'string' ? raw.query.trim() : '';
		if (!query) {
			return {
				output: { error: 'codebase_search: field `query` (non-empty string) is required.' },
				isError: true,
			};
		}
		const limit = typeof raw.limit === 'number' && Number.isFinite(raw.limit)
			? Math.max(1, Math.min(50, Math.floor(raw.limit)))
			: 12;
		const pathPrefixRaw = typeof raw.path_prefix === 'string'
			? raw.path_prefix
			: (typeof raw.pathPrefix === 'string' ? raw.pathPrefix : undefined);
		const pathPrefix = pathPrefixRaw?.trim().replace(/\\/g, '/') || undefined;

		try {
			const workspace = URI.file(params.workspace);
			const hits = await indexService.search(workspace, query, {
				maxResults: limit,
				pathPrefix,
				includeLexical: true,
			});
			return {
				output: {
					query,
					hitCount: hits.length,
					pathPrefix: pathPrefix ?? null,
					hits: hits.map(h => ({
						path: h.path,
						startLine: h.startLine,
						endLine: h.endLine,
						score: h.score,
						symbol: h.symbol ?? null,
						preview: h.preview,
					})),
				},
				isError: false,
			};
		} catch (e) {
			return {
				output: { error: e instanceof Error ? e.message : String(e) },
				isError: true,
			};
		}
	};
}
