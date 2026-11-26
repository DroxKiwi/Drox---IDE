/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDroxRegulationService } from '../../common/regulation/droxRegulationServiceContract.js';
import { computeDroxEffectiveToolSurface } from '../../common/droxEffectiveToolSurface.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { DROX_TOOL_GROUPS } from '../../common/droxToolGroups.js';
import { DroxToolBlockReason } from '../../common/droxEffectiveToolSurface.js';
import { droxPresetEnabledToggleableTools } from '../../common/droxEngineToolPreset.js';
import { readLlmSettings } from '../../common/droxRunSettings.js';
import { droxConfigurationResourceForRead } from '../../common/droxAgentsConfiguration.js';
import { persistDroxCustomToolsSurface } from '../../common/droxCustomToolsWorkflow.js';
import { IDroxToolsSurfaceService } from '../../common/droxToolsSurfaceService.js';
import { IDroxToolsSurfaceState } from '../../common/droxToolsSurfaceStore.js';
import { URI } from '../../../../../base/common/uri.js';
import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

export interface IDroxNativeChatToolsPanelHost {
	readonly root: HTMLElement;
	readonly workspaceFsPath: string;
	readonly workspaceResource: URI | undefined;
	readonly configurationService: IConfigurationService;
	readonly regulationService: IDroxRegulationService;
	readonly toolsSurfaceService: IDroxToolsSurfaceService;
}

export class DroxNativeChatToolsPanel {

	private _overlay: HTMLElement | undefined;

	show(host: IDroxNativeChatToolsPanelHost): void {
		this.hide();
		const overlay = dom.append(host.root, dom.$('.drox-native-tools-panel-overlay'));
		overlay.tabIndex = -1;
		const modal = dom.append(overlay, dom.$('.drox-native-tools-panel'));
		this._overlay = overlay;

		const header = dom.append(modal, dom.$('.drox-native-tools-panel-header'));
		dom.append(header, dom.$('h3', undefined, localize('drox.nativeChat.toolsPanel.title', 'Tool activation')));
		const closeBtn = dom.append(header, dom.$('button.drox-native-tools-panel-close', {
			title: localize('drox.nativeChat.toolsPanel.close', 'Close'),
		})) as HTMLButtonElement;
		closeBtn.textContent = '×';
		closeBtn.onclick = () => this.hide();

		const resource = droxConfigurationResourceForRead(host.configurationService, host.workspaceResource);
		const settings = readLlmSettings(host.configurationService, resource);
		let surfaceState = host.toolsSurfaceService.getStateForWorkspace(host.workspaceFsPath);
		let enabledSet = new Set<string>(
			surfaceState.customActive
				? surfaceState.enabled
				: droxPresetEnabledToggleableTools(settings.engineProfile),
		);

		const statusEl = dom.append(modal, dom.$('p.drox-native-tools-panel-status'));
		const body = dom.append(modal, dom.$('.drox-native-tools-panel-body'));

		const memoryEnabled = host.configurationService.getValue<boolean>(DroxSetting.MemoryEnabled, { resource: host.workspaceResource }) === true;

		const refresh = (): void => {
			const effective = computeDroxEffectiveToolSurface({
				engineProfile: settings.engineProfile,
				l2Module: 'custom',
				customEnabledTools: [...enabledSet],
				userDisabled: [],
				memoryEnabled,
			});
			statusEl.textContent = localize(
				'drox.nativeChat.toolsPanel.preview',
				'The model will see {0} tools. Regulation → L2 (manual, custom).',
				String(effective.enabledForSchema.length),
			);
			dom.clearNode(body);
			for (const group of DROX_TOOL_GROUPS) {
				const section = dom.append(body, dom.$('.drox-native-tools-group'));
				dom.append(section, dom.$('h4', undefined, group.label));
				for (const tool of group.tools) {
					const row = dom.append(section, dom.$('label.drox-native-tools-row'));
					const blocked = effective.blocked.get(tool.name) as DroxToolBlockReason | undefined;
					const input = dom.append(row, dom.$('input', { type: 'checkbox' })) as HTMLInputElement;
					const checked = enabledSet.has(tool.name);
					input.checked = checked;
					input.disabled = blocked === 'profile';
					dom.append(row, document.createTextNode(` ${tool.label}`));
					if (blocked === 'profile') {
						row.title = localize(
							'drox.nativeChat.toolsPanel.blockedProfile',
							'Not available on the current engine profile ({0}).',
							settings.engineProfile,
						);
						row.classList.add('is-profile-blocked');
					}
					if (input.disabled) {
						continue;
					}
					input.onchange = () => {
						if (input.checked) {
							enabledSet.add(tool.name);
						} else {
							enabledSet.delete(tool.name);
						}
						void persistToggle(host, [...enabledSet]).then(() => {
							surfaceState = host.toolsSurfaceService.getStateForWorkspace(host.workspaceFsPath);
							refresh();
						});
					};
				}
			}
		};

		overlay.onclick = e => {
			if (e.target === overlay) {
				this.hide();
			}
		};
		refresh();
	}

	hide(): void {
		if (this._overlay) {
			this._overlay.remove();
			this._overlay = undefined;
		}
	}
}

const toolsPanel = new DroxNativeChatToolsPanel();

export function openDroxToolsSurface(accessor: ServicesAccessor): void {
	const notificationService = accessor.get(INotificationService);
	const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
	if (!folder) {
		notificationService.warn(localize('drox.nativeChat.toolsPanel.noWorkspace', 'Open a workspace folder before changing tools.'));
		return;
	}
	const root = accessor.get(IWorkbenchLayoutService).getContainer(getActiveWindow());
	toolsPanel.show({
		root,
		workspaceFsPath: folder.uri.fsPath,
		workspaceResource: folder.uri,
		configurationService: accessor.get(IConfigurationService),
		regulationService: accessor.get(IDroxRegulationService),
		toolsSurfaceService: accessor.get(IDroxToolsSurfaceService),
	});
}

async function persistToggle(host: IDroxNativeChatToolsPanelHost, enabled: string[]): Promise<void> {
	const state: IDroxToolsSurfaceState = { customActive: true, enabled };
	await persistDroxCustomToolsSurface({
		workspaceRootFsPath: host.workspaceFsPath,
		regulationService: host.regulationService,
		toolsSurfaceService: host.toolsSurfaceService,
		state,
	});
}