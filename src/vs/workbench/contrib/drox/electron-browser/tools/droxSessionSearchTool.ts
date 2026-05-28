/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';

import { IDroxLongMemoryService } from '../../common/droxLongMemoryService.js';



export function createDroxSessionSearchToolHandler(

	longMemoryService: IDroxLongMemoryService,

): (params: IDroxToolExecParams) => Promise<IDroxToolExecResult> {

	return async (params: IDroxToolExecParams): Promise<IDroxToolExecResult> => {

		const raw = (params.input ?? {}) as { query?: string; limit?: number };

		const query = typeof raw.query === 'string' ? raw.query.trim() : '';

		if (!query) {

			return {

				output: { error: 'session_search: field `query` (non-empty string) is required.' },

				isError: true,

			};

		}

		const limit = typeof raw.limit === 'number' && Number.isFinite(raw.limit)

			? Math.floor(raw.limit)

			: undefined;

		try {

			const { hits, usedEmbedding } = await longMemoryService.searchMemories(

				URI.file(params.workspace),

				query,

				limit,

			);

			return {

				output: { query, hitCount: hits.length, usedEmbedding, hits },

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

