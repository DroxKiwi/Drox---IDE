/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Outils de lecture / exploration workspace (aligné moteur `phase_for_tool`). */
export const DROX_EXPLORE_TOOL_NAMES = new Set([
	'file_read',
	'glob',
	'grep',
	'lsp',
	'web_search',
	'web_fetch',
	'workspace_map_read',
	'memory_read',
	'memory_list',
	'task',
	'bash',
	'list_mcp_resources',
	'read_mcp_resource',
]);

export function isDroxExploreToolName(name: string | undefined): boolean {
	return typeof name === 'string' && DROX_EXPLORE_TOOL_NAMES.has(name);
}

/** Phase Exploring synthétique pour un outil (replay / filet UI). */
export function explorePhaseForToolName(name: string): 'analyzing' | 'reading' | 'acting' {
	if (name === 'glob' || name === 'workspace_map_read' || name === 'task') {
		return 'analyzing';
	}
	if (name === 'file_edit' || name === 'file_write' || name === 'notebook_edit' || name === 'delete_path') {
		return 'acting';
	}
	return 'reading';
}
