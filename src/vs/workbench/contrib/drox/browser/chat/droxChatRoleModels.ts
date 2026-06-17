/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import product from '../../../../../platform/product/common/product.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';

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
	params: {
		numCtx?: number;
		topP?: number;
		topK?: number;
		repeatPenalty?: number;
		minP?: number;
		seed?: number;
		temperature?: number;
	},
): Promise<void> {
	if (!isDroxDevFeatureEnabled('advancedLlmSettings', product)) {
		return;
	}
	const resource = deps.runSettingsService.getWorkspaceResource();
	if (params.numCtx !== undefined && Number.isFinite(params.numCtx)) {
		await deps.configurationService.updateValue(DroxSetting.NumCtx, params.numCtx, { resource });
	}
	if (params.topP !== undefined && Number.isFinite(params.topP)) {
		await deps.configurationService.updateValue(DroxSetting.TopP, params.topP, { resource });
	}
	if (params.topK !== undefined && Number.isFinite(params.topK)) {
		await deps.configurationService.updateValue(DroxSetting.TopK, params.topK, { resource });
	}
	if (params.repeatPenalty !== undefined && Number.isFinite(params.repeatPenalty)) {
		await deps.configurationService.updateValue(DroxSetting.RepeatPenalty, params.repeatPenalty, { resource });
	}
	if (params.minP !== undefined && Number.isFinite(params.minP)) {
		await deps.configurationService.updateValue(DroxSetting.MinP, params.minP, { resource });
	}
	if (params.seed !== undefined && Number.isFinite(params.seed)) {
		await deps.configurationService.updateValue(DroxSetting.Seed, params.seed, { resource });
	}
	if (params.temperature !== undefined && Number.isFinite(params.temperature)) {
		await deps.configurationService.updateValue(DroxSetting.Temperature, params.temperature, { resource });
	}
}

export function readDroxRoleModelsForWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'>,
): {
	architectModel: string;
	architectNumCtx?: number;
	architectTopP?: number;
	architectTopK?: number;
	architectRepeatPenalty?: number;
	architectMinP?: number;
	architectSeed?: number;
	architectTemperature?: number;
} {
	const resource = deps.runSettingsService.getWorkspaceResource();
	const llm = deps.runSettingsService.getLlmSettings(resource);
	const advanced = isDroxDevFeatureEnabled('advancedLlmSettings', product);
	return {
		architectModel: llm.model,
		...(advanced ? {
			architectNumCtx: llm.numCtx,
			architectTopP: llm.topP,
			architectTopK: llm.topK,
			architectRepeatPenalty: llm.repeatPenalty,
			architectMinP: llm.minP,
			architectSeed: llm.seed,
			architectTemperature: llm.temperature,
		} : {}),
	};
}
