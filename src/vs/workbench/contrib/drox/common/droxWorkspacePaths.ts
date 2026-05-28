/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../base/common/platform.js';
import { join, normalize } from '../../../../base/common/path.js';
import { normalizeWindowsFsPath } from './droxPathUtil.js';

/** Répertoire des transcripts chat Drox pour un workspace (`<root>/.drox/sessions`). */
export function droxWorkspaceSessionsDir(workspaceFsPath: string): string {
	return join(workspaceFsPath, '.drox', 'sessions');
}

/** Rapports `.md` exécuteur / orchestration (`<root>/.drox/agent-output`). */
export function droxWorkspaceAgentOutputDir(workspaceFsPath: string): string {
	return join(workspaceFsPath, '.drox', 'agent-output');
}

/** `true` when `filePath` is under `.drox/agent-output/` (executor / sub-agent deliverables). */
export function isUnderDroxAgentOutputPath(
	filePath: string,
	workspaceFsPath: string | undefined,
): boolean {
	if (!workspaceFsPath) {
		return false;
	}
	const root = normalize(droxWorkspaceAgentOutputDir(workspaceFsPath));
	const file = normalize(normalizeWindowsFsPath(filePath.trim()));
	if (!file) {
		return false;
	}
	const sep = isWindows ? '\\' : '/';
	const rootKey = isWindows ? root.toLowerCase() : root;
	const fileKey = isWindows ? file.toLowerCase() : file;
	return fileKey === rootKey || fileKey.startsWith(`${rootKey}${sep}`);
}
