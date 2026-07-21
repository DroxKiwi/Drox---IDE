/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';

import { URI } from '../../../../base/common/uri.js';

import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';

import { IDroxEngineService } from '../common/droxEngineService.js';

import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';

import {

	IDroxSessionCompactProgressHooks,

	IDroxSessionCompactService,

} from '../common/droxSessionCompactService.js';

import { IDroxSessionCompactResult, parseSessionCompactRpcResult } from '../common/droxSessionCompact.js';
import { llmHeadersForRpc, shouldSendApiKeyRpcParam } from '../common/droxLlmHeaders.js';



export class DroxSessionCompactService implements IDroxSessionCompactService {



	declare readonly _serviceBrand: undefined;



	constructor(

		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,

		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,

		@IProgressService private readonly progressService: IProgressService,

	) { }



	async compactSession(

		workspaceUri: URI,

		sessionId: string,

		hooks?: IDroxSessionCompactProgressHooks,

	): Promise<IDroxSessionCompactResult> {

		const setActive = (active: boolean) => hooks?.onActiveChange?.(active);



		return this.progressService.withProgress(

			{

				location: ProgressLocation.Window,

				title: localize('drox.compact.progressTitle', 'Drox — session compaction'),

			},

			async () => {

				await this.droxEngineService.initialize();

				const settings = this.runSettingsService.getLlmSettings(workspaceUri);

				const params: Record<string, unknown> = {
					id: sessionId,
					workspace: workspaceUri.fsPath,
				};

				if (settings.server) {

					params.server = settings.server;

				}

				if (settings.model) {

					params.model = settings.model;

				}

				params.provider = settings.llmProvider;

				const authContext = { provider: settings.llmProvider, server: settings.server };
				const headers = llmHeadersForRpc(settings.apiKey, settings.llmHeaders, authContext);
				if (headers) {
					params.headers = headers;
				}
				if (shouldSendApiKeyRpcParam(settings.apiKey, headers ?? {})) {
					params.apiKey = settings.apiKey;
				}

				setActive(true);

				try {

					const raw = await this.droxEngineService.request('session.compact', params);

					return parseSessionCompactRpcResult(raw);

				} finally {

					setActive(false);

				}

			},

		);

	}

}

