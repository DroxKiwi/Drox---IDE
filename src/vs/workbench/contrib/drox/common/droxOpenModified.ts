/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';
import { isUnderDroxAgentOutputPath } from './droxWorkspacePaths.js';

/** Lit `drox.openModifiedFiles` (défaut `true`). */
export function shouldOpenModifiedFiles(
	configurationService: IConfigurationService,
	scope?: URI,
): boolean {
	const v = configurationService.getValue<unknown>(DroxSetting.OpenModifiedFiles, { resource: scope });
	return typeof v === 'boolean' ? v : true;
}

/**
 * Whether the IDE should auto-open a file after a successful mutation tool.
 * Executor / sub-agent deliverables under `.drox/agent-output/` are excluded
 * (manual open from the chat file-change card remains available).
 */
export function shouldAutoOpenModifiedFilePath(
	configurationService: IConfigurationService,
	filePath: string,
	workspaceRoot: string | undefined,
	scope?: URI,
): boolean {
	if (!shouldOpenModifiedFiles(configurationService, scope)) {
		return false;
	}
	if (isUnderDroxAgentOutputPath(filePath, workspaceRoot)) {
		return false;
	}
	return true;
}
