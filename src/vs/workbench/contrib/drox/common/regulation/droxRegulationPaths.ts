/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../../base/common/path.js';

/** Workspace-local regulation store (scores history, later surface state). */
export const DROX_REGULATION_DIRNAME = '.drox/regulation';

export function droxRegulationDir(workspaceRootFsPath: string): string {
	return join(workspaceRootFsPath, '.drox', 'regulation');
}

export function droxRegulationHistoryPath(workspaceRootFsPath: string): string {
	return join(droxRegulationDir(workspaceRootFsPath), 'history.json');
}
