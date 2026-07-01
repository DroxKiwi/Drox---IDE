/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxLlmModelsService, IDroxLlmModelsSnapshot } from '../../common/droxLlmModelsService.js';
import { isDroxEmbeddingModelId } from '../../common/droxAgentsModels.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';
import { readDroxRoleModelsForWebview } from './droxChatRoleModels.js';

export interface IDroxChatLlmModelsHost {
	post(message: DroxHostToWebviewMessage): void;
}

export function pushLlmModelsSnapshotToWebview(
	host: IDroxChatLlmModelsHost,
	snapshot: IDroxLlmModelsSnapshot,
	runSettingsService?: IDroxRunSettingsService,
	configurationService?: IConfigurationService,
): void {
	const role = runSettingsService
		? readDroxRoleModelsForWebview({ runSettingsService })
		: undefined;
	host.post({
		kind: 'llmModels',
		provider: snapshot.provider,
		server: snapshot.server,
		models: snapshot.models.filter(model => !isDroxEmbeddingModelId(model)),
		selected: snapshot.selected,
		error: snapshot.error,
		listUrl: snapshot.listUrl,
		architectModel: role?.architectModel,
		architectNumCtx: role?.architectNumCtx,
		architectTemperature: role?.architectTemperature,
		architectTopP: role?.architectTopP,
		architectTopK: role?.architectTopK,
		architectRepeatPenalty: role?.architectRepeatPenalty,
		architectMinP: role?.architectMinP,
		architectSeed: role?.architectSeed,
		architectPresencePenalty: role?.architectPresencePenalty,
		architectFrequencyPenalty: role?.architectFrequencyPenalty,
		architectMaxTokens: role?.architectMaxTokens,
		architectKeepAlive: role?.architectKeepAlive,
	});
}

export async function refreshDroxChatLlmModels(
	host: IDroxChatLlmModelsHost,
	llmModelsService: IDroxLlmModelsService,
	runSettingsService?: IDroxRunSettingsService,
	configurationService?: IConfigurationService,
): Promise<void> {
	await llmModelsService.refresh();
	pushLlmModelsSnapshotToWebview(
		host,
		llmModelsService.snapshot,
		runSettingsService,
		configurationService,
	);
}
