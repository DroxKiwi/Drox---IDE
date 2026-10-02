/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Relative path of `fileFsPath` under `workspaceFsPath` (forward slashes), or undefined.
 * Pure path math — no editor / NL heuristics.
 */
export function droxRelativePathUnderWorkspace(workspaceFsPath: string, fileFsPath: string): string | undefined {
	const root = normalizeFsPath(workspaceFsPath);
	const file = normalizeFsPath(fileFsPath);
	if (!root || !file || file === root) {
		return undefined;
	}
	const rootPrefix = `${root}/`;
	const rootCmp = root.toLowerCase();
	const fileCmp = file.toLowerCase();
	if (!fileCmp.startsWith(`${rootCmp}/`)) {
		return undefined;
	}
	const rel = file.slice(rootPrefix.length);
	return rel.length > 0 ? rel : undefined;
}

/**
 * Force-inject path prefixes from an active editor file under the workspace.
 * Returns `[file, parentDir/]` when applicable so search recenters near the open file.
 */
export function droxForcePathPrefixesFromEditorFile(
	workspaceFsPath: string,
	fileFsPath: string,
): string[] | undefined {
	const rel = droxRelativePathUnderWorkspace(workspaceFsPath, fileFsPath);
	if (!rel) {
		return undefined;
	}
	const prefixes = [rel];
	const slash = rel.lastIndexOf('/');
	if (slash > 0) {
		prefixes.push(`${rel.slice(0, slash + 1)}`);
	}
	return prefixes;
}

function normalizeFsPath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+$/, '');
}
