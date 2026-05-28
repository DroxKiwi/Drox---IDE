/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';

import { localize } from '../../../../../nls.js';

import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';

import { IDroxChatSessionService } from '../../common/droxChatSessionService.js';

import { IDroxLongMemoryService } from '../../common/droxLongMemoryService.js';

import { IDroxSessionCompactService } from '../../common/droxSessionCompactService.js';



export function createDroxSessionCompactToolHandler(

	chatSessionService: IDroxChatSessionService,

	sessionCompactService: IDroxSessionCompactService,

	longMemoryService: IDroxLongMemoryService,

): (params: IDroxToolExecParams) => Promise<IDroxToolExecResult> {

	return async (params: IDroxToolExecParams): Promise<IDroxToolExecResult> => {

		const sessionId = chatSessionService.getSessionId();

		if (!sessionId) {

			return {

				output: {

					error: localize(

						'drox.tool.sessionCompactNoSession',

						'session_compact: no active session id — send a message in this thread first.',

					),

				},

				isError: true,

			};

		}

		if (chatSessionService.getRunId()) {

			return {

				output: {

					error: localize(

						'drox.tool.sessionCompactBusy',

						'session_compact: stop the current run before compacting the transcript.',

					),

				},

				isError: true,

			};

		}

		try {

			const wsUri = URI.file(params.workspace);

			const res = await sessionCompactService.compactSession(wsUri, sessionId);

			await longMemoryService.ingestFromSessionCompact(wsUri, sessionId, res);

			return {

				output: {

					objective: res.objective ?? null,

					summary: res.summary,

					files_touched: res.filesTouched,

					usage: res.usage,

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

