/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { DROX_DEFAULT_SUBAGENT_NUM_CTX, DROX_MAX_PARALLEL_EXECUTORS_CAP, DroxSetting, readOrchestrationMaxParallelExecutors } from '../../common/droxConfiguration.js';
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

function isExecutorSameAsArchitect(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'>,
): boolean {
	const resource = deps.runSettingsService.getWorkspaceResource();
	return !deps.runSettingsService.getSubagentSettings(resource).model.trim();
}

export async function setDroxExecutorModelFromWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {
		configurationService: IConfigurationService;
	},
	model: string,
): Promise<void> {
	const resource = deps.runSettingsService.getWorkspaceResource();
	const trimmed = model.trim();
	await deps.configurationService.updateValue(DroxSetting.ExecutorModel, trimmed, { resource });
	await deps.configurationService.updateValue(DroxSetting.SubagentsModel, trimmed, { resource });
	if (!trimmed) {
		const llm = deps.runSettingsService.getLlmSettings(resource);
		if (llm.numCtx !== undefined && Number.isFinite(llm.numCtx) && llm.numCtx > 0) {
			await deps.configurationService.updateValue(DroxSetting.SubagentsNumCtx, llm.numCtx, { resource });
		}
	}
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
	if (isExecutorSameAsArchitect(deps) && params.numCtx !== undefined && Number.isFinite(params.numCtx)) {
		await deps.configurationService.updateValue(DroxSetting.SubagentsNumCtx, params.numCtx, { resource });
	}
}

export async function setDroxExecutorLlmParamsFromWebview(
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
	const resource = deps.runSettingsService.getWorkspaceResource();
	if (isExecutorSameAsArchitect(deps)) {
		return;
	}
	if (params.numCtx !== undefined && Number.isFinite(params.numCtx)) {
		await deps.configurationService.updateValue(DroxSetting.SubagentsNumCtx, params.numCtx, { resource });
	}
	// Sampling partagé workspace (env Ollama du run) — même clés que l'architecte.
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

export async function setDroxOrchestrationMaxParallelExecutorsFromWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {
		configurationService: IConfigurationService;
	},
	value?: number,
): Promise<void> {
	const resource = deps.runSettingsService.getWorkspaceResource();
	if (value !== undefined && Number.isFinite(value)) {
		const n = Math.floor(value);
		await deps.configurationService.updateValue(
			DroxSetting.OrchestrationMaxParallelExecutors,
			Math.min(DROX_MAX_PARALLEL_EXECUTORS_CAP, Math.max(1, n)),
			{ resource },
		);
	}
}

export function readDroxRoleModelsForWebview(
	deps: Pick<{ runSettingsService: IDroxRunSettingsService }, 'runSettingsService'> & {
		configurationService?: IConfigurationService;
	},
): {
	architectModel: string;
	executorModel: string;
	architectNumCtx?: number;
	executorNumCtx: number;
	architectTopP?: number;
	architectTopK?: number;
	architectRepeatPenalty?: number;
	architectMinP?: number;
	architectSeed?: number;
	architectTemperature?: number;
	orchestrationMaxParallelExecutors?: number;
} {
	const resource = deps.runSettingsService.getWorkspaceResource();
	const llm = deps.runSettingsService.getLlmSettings(resource);
	const sub = deps.runSettingsService.getSubagentSettings(resource);
	const executorSameAsArchitect = !sub.model.trim();
	return {
		architectModel: llm.model,
		executorModel: sub.model,
		architectNumCtx: llm.numCtx,
		executorNumCtx: executorSameAsArchitect
			? (llm.numCtx ?? DROX_DEFAULT_SUBAGENT_NUM_CTX)
			: (sub.numCtx ?? DROX_DEFAULT_SUBAGENT_NUM_CTX),
		architectTopP: llm.topP,
		architectTopK: llm.topK,
		architectRepeatPenalty: llm.repeatPenalty,
		architectMinP: llm.minP,
		architectSeed: llm.seed,
		architectTemperature: llm.temperature,
		orchestrationMaxParallelExecutors: deps.configurationService
			? readOrchestrationMaxParallelExecutors(deps.configurationService, resource)
			: undefined,
	};
}
