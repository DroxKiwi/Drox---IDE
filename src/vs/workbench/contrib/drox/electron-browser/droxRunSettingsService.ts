/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { DroxArchitectInteractionMode } from '../common/droxArchitectInteractionMode.js';
import { IDroxAgentRunImage } from '../common/droxAttachments.js';
import { DroxPermissionMode } from '../common/droxPermissionAsk.js';
import {
	buildAgentRunParams,
	IDroxLlmSettings,
	isMcpToolsEnabled,
	llmSettingsToEnv,
	readArchitectInteractionMode,
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

	getLlmSettings(resource?: URI): IDroxLlmSettings {
		return readLlmSettings(this.configurationService, resource ?? this.getWorkspaceResource());
	}

	getEnvOverrides(resource?: URI): Record<string, string> {
		return llmSettingsToEnv(this.getLlmSettings(resource ?? this.getWorkspaceResource()));
	}

	getDisabledToolsForRun(resource?: URI): string[] {
		return readDisabledToolsForRun(this.configurationService, resource ?? this.getWorkspaceResource());
	}

	isMcpToolsEnabled(resource?: URI): boolean {
		return isMcpToolsEnabled(this.configurationService, resource ?? this.getWorkspaceResource());
	}

	getPermissionMode(resource?: URI): DroxPermissionMode {
		return readPermissionMode(this.configurationService, resource);
	}

	getArchitectInteractionMode(resource?: URI): DroxArchitectInteractionMode {
		return readArchitectInteractionMode(this.configurationService, resource ?? this.getWorkspaceResource());
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
	}): Record<string, unknown> {
		const resource = this.getWorkspaceResource();
		return buildAgentRunParams({
			...opts,
			settings: this.getLlmSettings(resource),
			disabledTools: this.getDisabledToolsForRun(resource),
			mcpToolsEnabled: this.isMcpToolsEnabled(resource),
			architectInteractionMode: readArchitectInteractionMode(this.configurationService, resource),
		});
	}
}
