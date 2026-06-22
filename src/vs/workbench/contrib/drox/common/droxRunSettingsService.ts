/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDroxAgentRunImage } from './droxAttachments.js';
import { DroxPermissionMode } from './droxPermissionAsk.js';
import { IDroxLlmSettings } from './droxRunSettings.js';

export const IDroxRunSettingsService = createDecorator<IDroxRunSettingsService>('droxRunSettingsService');

export interface IDroxRunSettingsService {
	readonly _serviceBrand: undefined;

	getWorkspaceResource(): URI | undefined;
	getLlmSettings(resource?: URI): IDroxLlmSettings;
	getEnvOverrides(resource?: URI): Record<string, string>;
	getDisabledToolsForRun(resource?: URI): string[];
	isMcpToolsEnabled(resource?: URI): boolean;
	getPermissionMode(resource?: URI): DroxPermissionMode;
	filterExecutableTools(toolNames: readonly string[], resource?: URI): string[];
	buildAgentRunParams(opts: {
		prompt: string;
		workspace: string;
		mode: string;
		sessionId: string;
		images?: readonly IDroxAgentRunImage[];
		runObjective?: string;
	}): Record<string, unknown>;
}
