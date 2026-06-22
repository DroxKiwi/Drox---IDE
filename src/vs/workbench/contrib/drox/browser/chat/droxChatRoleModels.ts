/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { URI } from '../../../../../base/common/uri.js';

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

import { DroxSetting } from '../../common/droxConfiguration.js';

import { clampDroxNumCtx } from '../../common/droxNumCtx.js';

import { effectiveMaxTokensForRun, IDroxLlmSettings } from '../../common/droxRunSettings.js';

import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
export interface IDroxArchitectLlmParamsPatch {

	readonly numCtx?: number;

	readonly temperature?: number | null;

	readonly topP?: number | null;

	readonly topK?: number | null;

	readonly repeatPenalty?: number | null;

	readonly minP?: number | null;

	readonly seed?: number | null;

	readonly presencePenalty?: number | null;

	readonly frequencyPenalty?: number | null;

	readonly maxTokens?: number | null;

	readonly keepAlive?: string | null;

}
export interface IDroxArchitectRoleModelsWire {

	readonly architectModel: string;

	readonly architectNumCtx?: number;

	readonly architectTemperature?: number;

	readonly architectTopP?: number;

	readonly architectTopK?: number;

	readonly architectRepeatPenalty?: number;

	readonly architectMinP?: number;

	readonly architectSeed?: number;

	readonly architectPresencePenalty?: number;

	readonly architectFrequencyPenalty?: number;

	readonly architectMaxTokens?: number;

	readonly architectKeepAlive?: string;

}
async function patchOptionalNumber(

	configService: IConfigurationService,

	key: string,

	resource: URI | undefined,

	value: number | null | undefined,

	transform?: (n: number) => number,

): Promise<void> {

	if (value === null) {

		await configService.updateValue(key, undefined, { resource });

		return;

	}

	if (value !== undefined && Number.isFinite(value)) {

		const n = transform ? transform(value) : value;

		await configService.updateValue(key, n, { resource });

	}

}
function wireOptionalLlmNumber(llm: IDroxLlmSettings, value: number | undefined): number | undefined {

	return value !== undefined && Number.isFinite(value) ? value : undefined;

}
export async function setDroxArchitectModelFromWebview(

	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {

		configurationService: IConfigurationService;

	},

	model: string,

): Promise<void> {

	const resource = deps.runSettingsService.getWorkspaceResource();

	await deps.configurationService.updateValue(DroxSetting.ArchitectModel, model.trim(), { resource });

}
export async function setDroxArchitectLlmParamsFromWebview(

	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {

		configurationService: IConfigurationService;

	},

	params: IDroxArchitectLlmParamsPatch,

): Promise<void> {

	const resource = deps.runSettingsService.getWorkspaceResource();

	const { configurationService } = deps;

	if (params.numCtx !== undefined && Number.isFinite(params.numCtx)) {

		await configurationService.updateValue(

			DroxSetting.NumCtx,

			clampDroxNumCtx(params.numCtx),

			{ resource },

		);

	}

	await patchOptionalNumber(configurationService, DroxSetting.Temperature, resource, params.temperature);

	await patchOptionalNumber(configurationService, DroxSetting.TopP, resource, params.topP);

	await patchOptionalNumber(configurationService, DroxSetting.TopK, resource, params.topK, n => Math.floor(n));

	await patchOptionalNumber(configurationService, DroxSetting.RepeatPenalty, resource, params.repeatPenalty);

	await patchOptionalNumber(configurationService, DroxSetting.MinP, resource, params.minP);

	await patchOptionalNumber(configurationService, DroxSetting.Seed, resource, params.seed, n => Math.floor(n));

	await patchOptionalNumber(configurationService, DroxSetting.PresencePenalty, resource, params.presencePenalty);

	await patchOptionalNumber(configurationService, DroxSetting.FrequencyPenalty, resource, params.frequencyPenalty);

	await patchOptionalNumber(

		configurationService,

		DroxSetting.MaxTokens,

		resource,

		params.maxTokens,

		n => Math.max(1, Math.floor(n)),

	);

	if (params.keepAlive !== undefined) {

		const trimmed = params.keepAlive === null ? '' : String(params.keepAlive).trim();

		await configurationService.updateValue(DroxSetting.KeepAlive, trimmed || undefined, { resource });

	}

}
export function readDroxRoleModelsForWebview(

	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'>,

): IDroxArchitectRoleModelsWire {

	const resource = deps.runSettingsService.getWorkspaceResource();

	const llm = deps.runSettingsService.getLlmSettings(resource);

	const maxTokens = effectiveMaxTokensForRun(llm);

	return {

		architectModel: llm.model,

		architectNumCtx: llm.numCtx,

		architectTemperature: wireOptionalLlmNumber(llm, llm.temperature),

		architectTopP: wireOptionalLlmNumber(llm, llm.topP),

		architectTopK: wireOptionalLlmNumber(llm, llm.topK),

		architectRepeatPenalty: wireOptionalLlmNumber(llm, llm.repeatPenalty),

		architectMinP: wireOptionalLlmNumber(llm, llm.minP),

		architectSeed: wireOptionalLlmNumber(llm, llm.seed),

		architectPresencePenalty: wireOptionalLlmNumber(llm, llm.presencePenalty),

		architectFrequencyPenalty: wireOptionalLlmNumber(llm, llm.frequencyPenalty),

		architectMaxTokens: maxTokens,

		architectKeepAlive: llm.keepAlive || undefined,

	};

}

