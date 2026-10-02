/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { droxForcePathPrefixesFromEditorFile } from '../../common/codebase/droxCodebaseForcePath.js';

/** Active text editor → force path prefixes under workspace (CB4 force chip). */
export function resolveDroxCodebaseForcePathPrefixesFromEditor(
	editorService: IEditorService,
	workspaceFsPath: string,
): string[] | undefined {
	const uri = editorService.activeEditor?.resource;
	if (!uri || uri.scheme !== 'file') {
		return undefined;
	}
	return droxForcePathPrefixesFromEditorFile(workspaceFsPath, uri.fsPath);
}
