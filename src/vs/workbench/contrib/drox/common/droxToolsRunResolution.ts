/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { droxConfigurationResourceForRead } from './droxAgentsConfiguration.js';
import { DroxSetting } from './droxConfiguration.js';
import { computeDroxEffectiveToolSurface } from './droxEffectiveToolSurface.js';
import { readDisabledToolsForRun, readLlmSettings } from './droxRunSettings.js';
import { IDroxRegulationService } from './regulation/droxRegulationServiceContract.js';
import { asDroxRegulationL2Module } from './regulation/droxRegulationL2Surface.js';
import { IDroxToolsSurfaceService } from './droxToolsSurfaceService.js';

export function resolveDroxDisabledToolsForRun(opts: {
	readonly configurationService: IConfigurationService;
	readonly resource?: URI;
	readonly workspaceFsPath: string;
	readonly regulationService?: IDroxRegulationService;
	readonly toolsSurfaceService?: IDroxToolsSurfaceService;
}): string[] {
	const resource = opts.resource;
	const llmResource = droxConfigurationResourceForRead(opts.configurationService, resource);
	const settings = readLlmSettings(opts.configurationService, llmResource);
	const userDisabled = readDisabledToolsForRun(opts.configurationService, llmResource);
	let l2 = opts.regulationService
		? asDroxRegulationL2Module(opts.regulationService.getModule('L2'))
		: 'standard' as const;
	const customState = opts.toolsSurfaceService?.getStateForWorkspace(opts.workspaceFsPath) ?? {
		customActive: false,
		enabled: [],
	};
	if (l2 === 'custom' && !customState.customActive) {
		l2 = 'standard';
	}
	const memoryEnabled = opts.configurationService.getValue<boolean>(DroxSetting.MemoryEnabled, { resource }) === true;
	return computeDroxEffectiveToolSurface({
		engineProfile: settings.engineProfile,
		l2Module: l2,
		customEnabledTools: customState.customActive ? customState.enabled : undefined,
		userDisabled,
		memoryEnabled,
	}).disabledTools;
}