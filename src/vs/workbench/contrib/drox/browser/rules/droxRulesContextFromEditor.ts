/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorsOrder } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { droxRelativePathUnderWorkspace } from '../../common/codebase/droxCodebaseForcePath.js';

/**
 * Open text editors under the workspace → relative paths for rule `applyTo` matching.
 */
export function resolveDroxRulesContextPathsFromEditor(
	editorService: IEditorService,
	workspaceFsPath: string,
): string[] | undefined {
	const out: string[] = [];
	const seen = new Set<string>();

	const consider = (fsPath: string | undefined) => {
		const rel = fsPath ? droxRelativePathUnderWorkspace(workspaceFsPath, fsPath) : undefined;
		if (!rel) {
			return;
		}
		const key = rel.toLowerCase();
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		out.push(rel);
	};

	for (const { editor } of editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
		const res = editor.resource;
		if (res?.scheme === 'file') {
			consider(res.fsPath);
		}
	}

	return out.length ? out : undefined;
}
