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



export function createDroxSessionEndToolHandler(

	chatSessionService: IDroxChatSessionService,

	longMemoryService: IDroxLongMemoryService,

): (params: IDroxToolExecParams) => Promise<IDroxToolExecResult> {

	return async (params: IDroxToolExecParams): Promise<IDroxToolExecResult> => {

		const sessionId = chatSessionService.getSessionId();

		if (!sessionId) {

			return {

				output: {

					error: localize(

						'drox.tool.sessionEndNoSession',

						'session_end: no active session id — send a user message first.',

					),

				},

				isError: true,

			};

		}

		try {

			const input = (params.input ?? {}) as { farewell_hint?: string; farewellHint?: string };

			const farewellHint = input.farewellHint ?? input.farewell_hint;

			const { closureId, chunkCount } = await longMemoryService.closeSession(

				URI.file(params.workspace),

				sessionId,

				farewellHint,

			);

			chatSessionService.setPendingSessionReset(true);

			return {

				output: {

					closureId,

					chunkCount,

					stored: true,

					resetAfterRun: true,

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

