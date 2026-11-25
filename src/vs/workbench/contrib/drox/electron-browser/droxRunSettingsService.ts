/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { droxConfigurationResourceForRead } from '../common/droxAgentsConfiguration.js';
import { IDroxAgentRunImage } from '../common/droxAttachments.js';
import { DroxPermissionMode } from '../common/droxPermissionAsk.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import {
	buildAgentRunParams,
	IDroxLlmSettings,
	isMcpToolsEnabled,
	llmSettingsToEnv,
	readLlmSettings,
	readPermissionMode,
	readSubagentsSettings,
} from '../common/droxRunSettings.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { getDisabledToolNames } from '../common/droxToolCatalog.js';
import { resolveDroxDisabledToolsForRun } from '../common/droxToolsRunResolution.js';
import { IDroxToolsSurfaceService } from '../common/droxToolsSurfaceService.js';
import { IDroxRegulationService } from '../common/regulation/droxRegulationServiceContract.js';

export class DroxRunSettingsService extends Disposable implements IDroxRunSettingsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeWorkspaceResource = this._register(new Emitter<void>());
	readonly onDidChangeWorkspaceResource = this._onDidChangeWorkspaceResource.event;
	private _activeWorkspaceOverride: URI | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxRegulationService private readonly regulationService: IDroxRegulationService,
		@IDroxToolsSurfaceService private readonly toolsSurfaceService: IDroxToolsSurfaceService,
	) {
		super();
		this._register(Event.any(
			this.regulationService.onDidChangeSurface,
			this.toolsSurfaceService.onDidChange,
		)(() => this._onDidChangeWorkspaceResource.fire()));
		const folder = this.workspaceContextService.getWorkspace().folders[0];
		if (folder) {
			void this.toolsSurfaceService.reload(folder.uri.fsPath);
		}
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			const next = this.workspaceContextService.getWorkspace().folders[0];
			if (next) {
				void this.toolsSurfaceService.reload(next.uri.fsPath);
			}
			this._onDidChangeWorkspaceResource.fire();
		}));
	}

	getWorkspaceResource(): URI | undefined {
		return this._activeWorkspaceOverride ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	setActiveWorkspaceResource(resource: URI | undefined): void {
		const prev = this._activeWorkspaceOverride?.toString();
		const next = resource?.toString();
		if (prev === next) {
			return;
		}
		this._activeWorkspaceOverride = resource;
		this._onDidChangeWorkspaceResource.fire();
	}
	private _llmConfigurationResource(explicit?: URI): URI | undefined {
		return droxConfigurationResourceForRead(this.configurationService, explicit ?? this.getWorkspaceResource());
	}
	getLlmSettings(resource?: URI): IDroxLlmSettings {

		return readLlmSettings(this.configurationService, this._llmConfigurationResource(resource));

	}
	getEnvOverrides(resource?: URI): Record<string, string> {

		return llmSettingsToEnv(this.getLlmSettings(resource));

	}
	getDisabledToolsForRun(resource?: URI): string[] {
		const llmResource = this._llmConfigurationResource(resource);
		const workspaceFsPath = (resource ?? this.getWorkspaceResource())?.fsPath
			?? this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath
			?? '';
		return resolveDroxDisabledToolsForRun({
			configurationService: this.configurationService,
			resource: llmResource,
			workspaceFsPath,
			regulationService: this.regulationService,
			toolsSurfaceService: this.toolsSurfaceService,
		});
	}
	isMcpToolsEnabled(resource?: URI): boolean {

		return isMcpToolsEnabled(this.configurationService, this._llmConfigurationResource(resource));

	}
	getPermissionMode(resource?: URI): DroxPermissionMode {

		return readPermissionMode(this.configurationService, resource ?? this.getWorkspaceResource());

	}
	filterExecutableTools(toolNames: readonly string[], resource?: URI): string[] {

		const disabled = getDisabledToolNames(this.getDisabledToolsForRun(resource));

		return toolNames.filter(n => !disabled.has(n));

	}
	buildAgentRunParams(opts: {

		prompt: string;

		workspace: string;

		mode: string;

		sessionId: string;
		images?: readonly IDroxAgentRunImage[];
		runObjective?: string;
		skipUserTurn?: boolean;
		allowOutsideWorkspace?: boolean;
		allowOutsideWorkspaceRead?: boolean;
		allowOutsideWorkspaceWrite?: boolean;
		system?: string;
	}): Record<string, unknown> {

		const resource = this._llmConfigurationResource();

		return buildAgentRunParams({

			...opts,

			settings: this.getLlmSettings(resource),

			disabledTools: this.getDisabledToolsForRun(resource),

			mcpToolsEnabled: this.isMcpToolsEnabled(resource),

			subagents: readSubagentsSettings(this.configurationService, resource),

			memoryEnabled: this.configurationService.getValue<boolean>(DroxSetting.MemoryEnabled, { resource }) === true,

		});

	}

}

