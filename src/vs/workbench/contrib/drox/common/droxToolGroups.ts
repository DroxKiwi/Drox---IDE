/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';

export interface IDroxToolCatalogEntry {
	readonly name: string;
	readonly label: string;
	readonly description: string;
}

export interface IDroxToolGroup {
	readonly id: string;
	readonly label: string;
	readonly tools: readonly IDroxToolCatalogEntry[];
}

/** Registre documenté pour `drox.tools.disabled` (parité extension `toolSettings.ts`). */
export const DROX_TOOL_GROUPS: readonly IDroxToolGroup[] = [
	{
		id: 'files',
		label: localize('drox.toolGroup.files', 'Files & search'),
		tools: [
			{ name: 'glob', label: 'glob', description: localize('drox.tool.glob', 'Find files by pattern') },
			{ name: 'grep', label: 'grep', description: localize('drox.tool.grep', 'Search text in the repo') },
			{ name: 'file_read', label: 'file_read', description: localize('drox.tool.fileRead', 'Read files') },
		],
	},
	{
		id: 'edit',
		label: localize('drox.toolGroup.edit', 'Editing'),
		tools: [
			{ name: 'file_edit', label: 'file_edit', description: localize('drox.tool.fileEdit', 'Patch-based edits') },
			{ name: 'file_write', label: 'file_write', description: localize('drox.tool.fileWrite', 'Write or create files') },
			{ name: 'notebook_edit', label: 'notebook_edit', description: localize('drox.tool.notebookEdit', 'Edit Jupyter notebooks') },
			{ name: 'delete_path', label: 'delete_path', description: localize('drox.tool.deletePath', 'Delete paths') },
			{ name: 'copy_path', label: 'copy_path', description: localize('drox.tool.copyPath', 'Copy files or folders') },
		],
	},
	{
		id: 'exec',
		label: localize('drox.toolGroup.exec', 'Execution'),
		tools: [
			{ name: 'bash', label: 'bash', description: localize('drox.tool.bash', 'Shell commands (sensitive — permissions)') },
		],
	},
	{
		id: 'ide',
		label: localize('drox.toolGroup.ide', 'IDE / analysis'),
		tools: [
			{ name: 'lsp', label: 'lsp', description: localize('drox.tool.lsp', 'LSP symbols, definitions, diagnostics') },
		],
	},
	{
		id: 'web',
		label: localize('drox.toolGroup.web', 'Web'),
		tools: [
			{ name: 'web_search', label: 'web_search', description: localize('drox.tool.webSearch', 'Web search') },
			{ name: 'web_fetch', label: 'web_fetch', description: localize('drox.tool.webFetch', 'Fetch URL content') },
		],
	},
	{
		id: 'plan',
		label: localize('drox.toolGroup.plan', 'Plan & interaction'),
		tools: [
			{ name: 'exit_plan_mode', label: 'exit_plan_mode', description: localize('drox.tool.exitPlanMode', 'Leave plan mode') },
		],
	},
	{
		id: 'memory',
		label: localize('drox.toolGroup.memory', 'Session memory'),
		tools: [
			{ name: 'session_note', label: 'session_note', description: localize('drox.tool.sessionNote', 'Session note') },
			{ name: 'memory_read', label: 'memory_read', description: localize('drox.tool.memoryRead', 'Read long memory') },
			{ name: 'memory_list', label: 'memory_list', description: localize('drox.tool.memoryList', 'List memory entries') },
			{ name: 'session_compact', label: 'session_compact', description: localize('drox.tool.sessionCompact', 'Compact transcript (IDE client)') },
			{ name: 'session_search', label: 'session_search', description: localize('drox.tool.sessionSearch', 'Search long memory (IDE client)') },
		],
	},
	{
		id: 'codebase',
		label: localize('drox.toolGroup.codebase', 'Codebase'),
		tools: [
			{ name: 'codebase_search', label: 'codebase_search', description: localize('drox.tool.codebaseSearch', 'Search local @Codebase index (IDE client)') },
		],
	},
	{
		id: 'skills',
		label: localize('drox.toolGroup.skills', 'Skills'),
		tools: [
			{ name: 'skill_read', label: 'skill_read', description: localize('drox.tool.skillRead', 'Read a local skill') },
			{ name: 'skill_list', label: 'skill_list', description: localize('drox.tool.skillList', 'List skills') },
		],
	},
	{
		id: 'git',
		label: localize('drox.toolGroup.git', 'Git worktrees'),
		tools: [
			{ name: 'git_worktree_enter', label: 'git_worktree_enter', description: localize('drox.tool.gitWorktreeEnter', 'Enter isolated worktree') },
			{ name: 'git_worktree_exit', label: 'git_worktree_exit', description: localize('drox.tool.gitWorktreeExit', 'Leave current worktree') },
		],
	},
];

export const DROX_TOGGLEABLE_TOOL_NAMES: readonly string[] = DROX_TOOL_GROUPS.flatMap(g => g.tools.map(t => t.name));

export function formatToolGroupsForSettingsDescription(): string {
	const lines = [
		localize('drox.tools.disabled.intro', 'Disabled tools for this workspace: the model does not receive their schema.'),
		'',
		localize('drox.tools.disabled.alwaysActive', '**Always active** (not listable): `ask_user_question`, `todo_write`.'),
		'',
		localize('drox.tools.disabled.groupsHeader', '**Groups**:'),
	];
	for (const g of DROX_TOOL_GROUPS) {
		lines.push(`- **${g.label}** : ${g.tools.map(t => `\`${t.name}\``).join(', ')}`);
	}
	lines.push(
		'',
		localize('drox.tools.disabled.mcpHint', 'Dynamic MCP tools (`mcp__…`) are controlled via `drox.tools.mcp.enabled`.'),
	);
	return lines.join('\n');
}
