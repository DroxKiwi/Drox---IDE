/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';

export function droxToolsSurfacePath(workspaceRootFsPath: string): string {
	return join(workspaceRootFsPath, '.drox', 'tools-surface.json');
}