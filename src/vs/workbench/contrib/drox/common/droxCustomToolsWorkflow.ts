/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../base/common/uri.js';
import { applyDroxConfigurationUpdate, droxConfigurationResourceForRead } from './droxAgentsConfiguration.js';
import { DroxSetting } from './droxConfiguration.js';
import { DroxEngineProfileId } from './droxEngineProfile.js';
import { droxDefaultL2ModuleForEngineProfile } from './droxEngineToolPreset.js';
import { IDroxRegulationService } from './regulation/droxRegulationServiceContract.js';
import { IDroxToolsSurfaceService } from './droxToolsSurfaceService.js';
import { IDroxToolsSurfaceState } from './droxToolsSurfaceStore.js';

/** Clear custom tools matrix when the engine profile changes (Server settings). */
export async function clearDroxCustomToolsOnEngineProfileChange(deps: {
	readonly workspaceRootFsPath: string;
	readonly workspaceResource: URI | undefined;
	readonly configurationService: IConfigurationService;
	readonly regulationService: IDroxRegulationService;
	readonly toolsSurfaceService: IDroxToolsSurfaceService;
	readonly engineProfile: DroxEngineProfileId;
}): Promise<void> {
	if (!deps.workspaceRootFsPath) {
		return;
	}
	await deps.regulationService.ensureHistoryLoaded(deps.workspaceRootFsPath);
	await deps.toolsSurfaceService.clearCustom(deps.workspaceRootFsPath);
	deps.regulationService.setLeverMode('L2', 'auto');
	deps.regulationService.setLeverModule('L2', droxDefaultL2ModuleForEngineProfile(deps.engineProfile));
	const resource = droxConfigurationResourceForRead(deps.configurationService, deps.workspaceResource);
	await applyDroxConfigurationUpdate(deps.configurationService, DroxSetting.ToolsDisabled, [], resource);
}

export async function persistDroxCustomToolsSurface(deps: {
	readonly workspaceRootFsPath: string;
	readonly regulationService: IDroxRegulationService;
	readonly toolsSurfaceService: IDroxToolsSurfaceService;
	readonly state: IDroxToolsSurfaceState;
}): Promise<void> {
	await deps.regulationService.ensureHistoryLoaded(deps.workspaceRootFsPath);
	await deps.toolsSurfaceService.persist(deps.workspaceRootFsPath, deps.state);
	deps.regulationService.setLeverMode('L2', 'manual');
	deps.regulationService.setLeverModule('L2', 'custom');
}