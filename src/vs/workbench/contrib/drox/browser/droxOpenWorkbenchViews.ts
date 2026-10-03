/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { DroxViews } from '../common/drox.js';

export interface IDroxOpenWorkbenchViewsDeps {
	readonly viewsService: IViewsService;
	readonly layoutService?: IWorkbenchLayoutService;
	readonly environmentService?: IWorkbenchEnvironmentService;
}

/** Opens the shared @Codebase cockpit — IDE sidebar · Agents auxiliary bar. */
export async function openDroxCodebaseCockpit(deps: IDroxOpenWorkbenchViewsDeps | IViewsService): Promise<void> {
	const { viewsService, layoutService, environmentService } = normalizeDeps(deps);
	if (environmentService?.isSessionsWindow) {
		layoutService?.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await viewsService.openViewContainer(DroxViews.CodebaseSessionsViewContainerId, true);
		await viewsService.openView(DroxViews.CodebaseSessionsViewId, true);
		return;
	}
	layoutService?.setPartHidden(false, Parts.SIDEBAR_PART);
	await viewsService.openViewContainer(DroxViews.CodebaseViewContainerId, true);
	await viewsService.openView(DroxViews.CodebaseViewId, true);
}

/** Opens the model regulation observatory — IDE sidebar · Agents auxiliary bar. */
export async function openDroxRegulationView(deps: IDroxOpenWorkbenchViewsDeps | IViewsService): Promise<void> {
	const { viewsService, layoutService, environmentService } = normalizeDeps(deps);
	if (environmentService?.isSessionsWindow) {
		layoutService?.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await viewsService.openViewContainer(DroxViews.RegulationSessionsViewContainerId, true);
		await viewsService.openView(DroxViews.RegulationSessionsViewId, true);
		return;
	}
	layoutService?.setPartHidden(false, Parts.SIDEBAR_PART);
	await viewsService.openViewContainer(DroxViews.RegulationViewContainerId, true);
	await viewsService.openView(DroxViews.RegulationViewId, true);
}

/** Opens the traffic observatory — IDE sidebar · Agents auxiliary bar. */
export async function openDroxTrafficView(deps: IDroxOpenWorkbenchViewsDeps | IViewsService): Promise<void> {
	const { viewsService, layoutService, environmentService } = normalizeDeps(deps);
	if (environmentService?.isSessionsWindow) {
		layoutService?.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await viewsService.openViewContainer(DroxViews.TrafficSessionsViewContainerId, true);
		await viewsService.openView(DroxViews.TrafficSessionsViewId, true);
		return;
	}
	layoutService?.setPartHidden(false, Parts.SIDEBAR_PART);
	await viewsService.openViewContainer(DroxViews.TrafficViewContainerId, true);
	await viewsService.openView(DroxViews.TrafficViewId, true);
}

/** Opens declarative Ports / forward panel — IDE sidebar · Agents auxiliary bar. */
export async function openDroxPortsView(deps: IDroxOpenWorkbenchViewsDeps | IViewsService): Promise<void> {
	const { viewsService, layoutService, environmentService } = normalizeDeps(deps);
	if (environmentService?.isSessionsWindow) {
		layoutService?.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await viewsService.openViewContainer(DroxViews.PortsSessionsViewContainerId, true);
		await viewsService.openView(DroxViews.PortsSessionsViewId, true);
		return;
	}
	layoutService?.setPartHidden(false, Parts.SIDEBAR_PART);
	await viewsService.openViewContainer(DroxViews.PortsViewContainerId, true);
	await viewsService.openView(DroxViews.PortsViewId, true);
}

function normalizeDeps(deps: IDroxOpenWorkbenchViewsDeps | IViewsService): IDroxOpenWorkbenchViewsDeps {
	if (typeof (deps as IDroxOpenWorkbenchViewsDeps).viewsService !== 'undefined') {
		return deps as IDroxOpenWorkbenchViewsDeps;
	}
	return { viewsService: deps as IViewsService };
}
