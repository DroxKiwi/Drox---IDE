/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDroxEngineService } from '../droxEngineService.js';
import { IDroxRunSettingsService } from '../droxRunSettingsService.js';
import {
	parseLlmProvider,
	readLlmProvider,
	resolveLlmCatalogConnection,
} from '../droxLlmCatalog.js';
import { mergeLlmHttpHeaders } from '../droxLlmHeaders.js';
import { DroxSetting } from '../droxConfiguration.js';
import { parseCodebaseRetrievalFilter } from './droxModelQuestionParse.js';
import { resolveDroxModelQuestionVariant } from './droxModelQuestionResolve.js';
import { callDroxModelQuestionLlm } from './droxModelQuestionLlmCall.js';
import {
	DroxModelQuestionId,
	IDroxCodebaseRetrievalFilter,
	IDroxModelQuestionResolveOpts,
} from './droxModelQuestionTypes.js';

const COMPREHENSION_TIMEOUT_MS = 2800;

export const IDroxModelQuestionService = createDecorator<IDroxModelQuestionService>('droxModelQuestionService');

export interface IDroxModelQuestionService {
	readonly _serviceBrand: undefined;
	/**
	 * Comprehension → structured codebase retrieval filter.
	 * Returns undefined on timeout / parse / transport failure (caller falls back).
	 */
	comprehendCodebaseRetrieval(userMessage: string, opts?: IDroxModelQuestionResolveOpts): Promise<IDroxCodebaseRetrievalFilter | undefined>;
}

export class DroxModelQuestionService extends Disposable implements IDroxModelQuestionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IDroxEngineService private readonly engineService: IDroxEngineService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async comprehendCodebaseRetrieval(
		userMessage: string,
		opts?: IDroxModelQuestionResolveOpts,
	): Promise<IDroxCodebaseRetrievalFilter | undefined> {
		const q = userMessage.trim();
		if (!q) {
			return undefined;
		}
		const questionId: DroxModelQuestionId = 'codebase.retrieval.comprehension';
		const configured = this.configurationService.getValue<string>(DroxSetting.ModelQuestionCodebaseComprehensionVariant);
		const configuredVariant = typeof configured === 'string' && configured.trim() ? configured.trim() : undefined;
		const variantId = opts?.variantId ?? configuredVariant;
		const variant = resolveDroxModelQuestionVariant(questionId, { ...opts, variantId });

		const result = await raceTimeout(
			this._askFilter(variant, q),
			COMPREHENSION_TIMEOUT_MS,
		);
		if (!result) {
			this.logService.trace('[drox-model-questions] comprehension timeout/empty');
		}
		return result;
	}

	private async _askFilter(
		variant: ReturnType<typeof resolveDroxModelQuestionVariant>,
		userMessage: string,
	): Promise<IDroxCodebaseRetrievalFilter | undefined> {
		try {
			await this.engineService.initialize();
			const workspace = this.runSettingsService.getWorkspaceResource();
			const conn = await resolveLlmCatalogConnection(this.configurationService, this.fileService, workspace);
			const llm = this.runSettingsService.getLlmSettings(workspace);
			const model = llm.model?.trim();
			if (!model || !conn.server.trim()) {
				return undefined;
			}
			const provider = parseLlmProvider(conn.provider) || readLlmProvider(this.configurationService, workspace);
			const headers = mergeLlmHttpHeaders(conn.apiKey, conn.headers, { provider, server: conn.server });
			const raw = await callDroxModelQuestionLlm({
				provider,
				server: conn.server,
				model,
				headers,
				fetchHttp: (url, hdrs, options) => this.engineService.fetchHttp(url, hdrs, options),
			}, variant, userMessage);
			if (!raw) {
				return undefined;
			}
			const filter = parseCodebaseRetrievalFilter(raw, variant);
			if (filter) {
				this.logService.trace(`[drox-model-questions] filter ok variant=${variant.variantId} q=${filter.searchQuery.slice(0, 80)}`);
			}
			return filter;
		} catch (err) {
			this.logService.trace(`[drox-model-questions] ask failed: ${err}`);
			return undefined;
		}
	}
}
