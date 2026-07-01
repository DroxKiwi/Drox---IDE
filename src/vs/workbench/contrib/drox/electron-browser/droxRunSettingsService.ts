/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

import { droxConfigurationResourceForRead } from '../common/droxAgentsConfiguration.js';

import { IDroxAgentRunImage } from '../common/droxAttachments.js';

import { DroxPermissionMode } from '../common/droxPermissionAsk.js';

import {

	buildAgentRunParams,

	IDroxLlmSettings,

	isMcpToolsEnabled,

	llmSettingsToEnv,

	readDisabledToolsForRun,

	readLlmSettings,

	readPermissionMode,

} from '../common/droxRunSettings.js';

import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';

import { getDisabledToolNames } from '../common/droxToolCatalog.js';
export class DroxRunSettingsService implements IDroxRunSettingsService {

	declare readonly _serviceBrand: undefined;
	constructor(

		@IConfigurationService private readonly configurationService: IConfigurationService,

		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,

	) { }
	getWorkspaceResource(): URI | undefined {

		return this.workspaceContextService.getWorkspace().folders[0]?.uri;

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

		return readDisabledToolsForRun(this.configurationService, this._llmConfigurationResource(resource));

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
	}): Record<string, unknown> {

		const resource = this._llmConfigurationResource();

		return buildAgentRunParams({

			...opts,

			settings: this.getLlmSettings(resource),

			disabledTools: this.getDisabledToolsForRun(resource),

			mcpToolsEnabled: this.isMcpToolsEnabled(resource),

		});

	}

}

