/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parent tool allowlist (parity drox-engine `EngineProfile::parent_tool_allowlist`).
 * `undefined` = no extra profile cap (cloud-full).
 */

import { DroxEngineProfileId } from './droxEngineProfile.js';

const LOCAL_9B_PARENT = new Set([
	'todo_write',
	'file_read',
	'grep',
	'glob',
	'file_edit',
	'file_write',
	'delete_path',
	'bash',
	'task',
	'codebase_search',
	'sdtcm_align',
	'exit_plan_mode',
	'project_rule_write',
]);

const LOCAL_27B_PARENT = new Set([
	'todo_write',
	'file_read',
	'grep',
	'glob',
	'file_edit',
	'file_write',
	'delete_path',
	'copy_path',
	'notebook_edit',
	'bash',
	'task',
	'explore_artifact_read',
	'codebase_search',
	'sdtcm_align',
	'exit_plan_mode',
	'lsp',
	'web_search',
	'web_fetch',
	'ask_user_question',
	'workspace_map_read',
	'memory_read',
	'memory_list',
	'session_note',
	'project_rule_write',
	'skill_list',
	'skill_read',
]);

/** Toggleable names exposed to the parent for this engine profile, or `undefined` if uncapped. */
export function droxEngineProfileParentTools(profile: DroxEngineProfileId): ReadonlySet<string> | undefined {
	switch (profile) {
		case 'local-9b':
			return LOCAL_9B_PARENT;
		case 'local-27b':
			return LOCAL_27B_PARENT;
		case 'cloud-full':
			return undefined;
		default:
			return LOCAL_9B_PARENT;
	}
}

export function droxEngineProfileAllowsTool(profile: DroxEngineProfileId, toolName: string): boolean {
	const allow = droxEngineProfileParentTools(profile);
	if (!allow) {
		return true;
	}
	return allow.has(toolName);
}