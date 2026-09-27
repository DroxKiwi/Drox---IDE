/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

import { applyDroxConfigurationUpdate } from '../../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../common/droxConfiguration.js';

import { clampDroxNumCtx } from '../../common/droxNumCtx.js';

import { effectiveMaxTokensForRun, IDroxLlmSettings } from '../../common/droxRunSettings.js';
import { normalizeDroxLlmParamsMuted } from '../../common/droxLlmParamMute.js';

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

	readonly mutedParams?: readonly string[] | null;

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

	readonly architectLlmParamsMuted?: readonly string[];

}
async function patchOptionalNumber(

	configService: IConfigurationService,

	key: string,

	workspaceResource: URI | undefined,

	value: number | null | undefined,

	transform?: (n: number) => number,

): Promise<void> {

	if (value === null) {

		await applyDroxConfigurationUpdate(configService, key, undefined, workspaceResource);

		return;

	}

	if (value !== undefined && Number.isFinite(value)) {

		const n = transform ? transform(value) : value;

		await applyDroxConfigurationUpdate(configService, key, n, workspaceResource);

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

	const workspaceResource = deps.runSettingsService.getWorkspaceResource();

	await applyDroxConfigurationUpdate(deps.configurationService, DroxSetting.ArchitectModel, model.trim(), workspaceResource);

}
export async function setDroxArchitectLlmParamsFromWebview(

	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {

		configurationService: IConfigurationService;

	},

	params: IDroxArchitectLlmParamsPatch,

): Promise<void> {

	const workspaceResource = deps.runSettingsService.getWorkspaceResource();

	const { configurationService } = deps;

	if (params.numCtx !== undefined && Number.isFinite(params.numCtx)) {

		await applyDroxConfigurationUpdate(

			configurationService,

			DroxSetting.NumCtx,

			clampDroxNumCtx(params.numCtx),

			workspaceResource,

		);

	}

	await patchOptionalNumber(configurationService, DroxSetting.Temperature, workspaceResource, params.temperature);

	await patchOptionalNumber(configurationService, DroxSetting.TopP, workspaceResource, params.topP);

	await patchOptionalNumber(configurationService, DroxSetting.TopK, workspaceResource, params.topK, n => Math.floor(n));

	await patchOptionalNumber(configurationService, DroxSetting.RepeatPenalty, workspaceResource, params.repeatPenalty);

	await patchOptionalNumber(configurationService, DroxSetting.MinP, workspaceResource, params.minP);

	await patchOptionalNumber(configurationService, DroxSetting.Seed, workspaceResource, params.seed, n => Math.floor(n));

	await patchOptionalNumber(configurationService, DroxSetting.PresencePenalty, workspaceResource, params.presencePenalty);

	await patchOptionalNumber(configurationService, DroxSetting.FrequencyPenalty, workspaceResource, params.frequencyPenalty);

	await patchOptionalNumber(

		configurationService,

		DroxSetting.MaxTokens,

		workspaceResource,

		params.maxTokens,

		n => Math.max(1, Math.floor(n)),

	);

	if (params.keepAlive !== undefined) {

		const trimmed = params.keepAlive === null ? '' : String(params.keepAlive).trim();

		await applyDroxConfigurationUpdate(configurationService, DroxSetting.KeepAlive, trimmed || undefined, workspaceResource);

	}

	if (params.mutedParams !== undefined) {
		const muted = normalizeDroxLlmParamsMuted(params.mutedParams ?? []);
		await applyDroxConfigurationUpdate(
			configurationService,
			DroxSetting.LlmParamsMuted,
			muted.length > 0 ? [...muted] : [],
			workspaceResource,
		);
	}

}
export function readDroxRoleModelsForWebview(

	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'>,

): IDroxArchitectRoleModelsWire {

	const llm = deps.runSettingsService.getLlmSettings();

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

		architectLlmParamsMuted: [...llm.llmParamsMuted],

	};

}

