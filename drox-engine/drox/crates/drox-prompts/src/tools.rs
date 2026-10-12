//! Descriptions d'outils exposées au LLM (schéma companion text).

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

macro_rules! tool_prompt {
	($desc:ident, $entry:ident, $id:literal, $tool:literal, $body:expr) => {
		pub const $desc: &str = $body;
		pub const $entry: PromptEntry = PromptEntry {
			id: $id,
			intent: PromptIntent::ToolSchema,
			strength: PromptStrength::MustText,
			audience: PromptAudience::ToolSchema,
			when: concat!("tool_registered:", $tool),
			topics: &[$tool],
			claims: &[],
			body: $desc,
		};
	};
	($desc:ident, $entry:ident, $id:literal, $tool:literal, claims: $claims:expr, $body:expr) => {
		pub const $desc: &str = $body;
		pub const $entry: PromptEntry = PromptEntry {
			id: $id,
			intent: PromptIntent::ToolSchema,
			strength: PromptStrength::MustText,
			audience: PromptAudience::ToolSchema,
			when: concat!("tool_registered:", $tool),
			topics: &[$tool],
			claims: $claims,
			body: $desc,
		};
	};
}

// ── Already migrated (policy claims) ────────────────────────────────────────

tool_prompt!(
	FILE_READ_TOOL_DESCRIPTION,
	FILE_READ_TOOL_ENTRY,
	"tools.file_read.description",
	"file_read",
	claims: &["outside_ws.file_read=always"],
	"Reads the UTF-8 content of a file. Prefer workspace-relative paths; **absolute paths \
outside the workspace are always allowed for read-only access** (do not use bash Get-Content/cat \
for that — this works even when the outside-workspace session toggle is off). Without `start_line`/`end_line`: reads from the beginning (truncated beyond \
512 KiB). With both: **line window** 1-based inclusive (max 400 lines, output max ~128 KiB) \
— ideal after a `grep` to avoid loading the entire file."
);

pub const TASK_TOOL_DESCRIPTION: &str = "\
Launch a specialized **Explore** sub-agent (read-only: grep, glob, file_read, lsp, …) in an \
**isolated context**. Prefer over parent `file_read` spam to **save context**.

**Protocol:** Plan → Assign → Merge lives in the system **Sub-agents — Explore** supplement \
(when present) — do not re-derive it here.

You receive `explore_id`, short **summary**/**blurb**, `artifacts` paths, and \
**`artifacts_inline`** (capped kind bodies for immediate merge) — not a source-tree dump. \
Zoom with `explore_index_list` / `explore_artifact_read` (same discussion only). \
Artifacts under `.drox/subagents/<this discussion>/…`. Child may `file_read` **absolute \
paths outside the workspace** (RO) — put them in `description`.

**Return contracts (prefer always):** set `return_kinds`. Engine fills each kind \
(JSON → artefact) and flags `kinds_incomplete` if missing/stub. Kinds: \
`paths_read` | `file_summaries` | `key_symbols` | `code_snippets` | `structure_map` | `gaps`. \
Optional `return_options` (**JSON object**, never a stringified JSON string): maxFiles, \
maxCharsPerFile, maxSnippets, maxItems, maxDepth, focus, signaturesOnly, \
includeLineCounts, globFilter, symbolKinds.

**When:** understanding / synthesis / multi-file / docs / unfamiliar (≥3 files). \
**When NOT:** needle 1–2 known paths; mutations (Explore is RO).

**Args:** `title`, `description` (**short scoop** — goal + folders/symbols; engine caps ~900 chars; \
no essays), `return_kinds` (string[]), \
`return_options` (object — e.g. `{\"maxFiles\":25}`, **not** `\"{\\\"maxFiles\\\":25}\"`), \
`must_return` (legacy prose, few short items), `plan_step_id`, `subagent_type`=`explore`, \
`thoroughness`=`quick|medium|very thorough`.

Requires `drox.subagents.enabled`. V1: `explore` only. Index is **session-scoped** \
(this discussion only).";

pub const TASK_TOOL_ENTRY: PromptEntry = PromptEntry {
	id: "tools.task.description",
	intent: PromptIntent::ToolSchema,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::ToolSchema,
	when: "tool_registered:task",
	// Protocol canon = session.subagents.explore ; schema = contracts + args only.
	topics: &["explore", "outside_ws"],
	claims: &[
		"explore.file_read_absolute=same_as_parent",
		"outside_ws.file_read=always",
		"explore.return_kinds=typed_prefer",
		"explore.index=session_scoped",
	],
	body: TASK_TOOL_DESCRIPTION,
};

tool_prompt!(
	EXPLORE_INDEX_LIST_TOOL_DESCRIPTION,
	EXPLORE_INDEX_LIST_TOOL_ENTRY,
	"tools.explore_index_list.description",
	"explore_index_list",
	claims: &["explore.index=session_scoped"],
	"List short Explore blurbs for **this discussion only** (session-scoped index). \
Use to decide where to dig without reloading full reports. Returns exploreId, blurb, \
returnKinds, status, artifact paths. Prefer this before parent file_read of sources."
);

tool_prompt!(
	EXPLORE_ARTIFACT_READ_TOOL_DESCRIPTION,
	EXPLORE_ARTIFACT_READ_TOOL_ENTRY,
	"tools.explore_artifact_read.description",
	"explore_artifact_read",
	claims: &["explore.index=session_scoped", "explore.return_kinds=typed_prefer"],
	"Read one Explore return artifact by explore_id + kind \
(paths_read|file_summaries|key_symbols|code_snippets|structure_map|gaps). \
Scoped to **this discussion** — unknown explore_id from another chat is rejected. \
Prefer over re-reading the original source tree."
);

tool_prompt!(
	EXPLORE_COMMIT_TOOL_DESCRIPTION,
	EXPLORE_COMMIT_TOOL_ENTRY,
	"tools.explore_commit.description",
	"explore_commit",
	claims: &[
		"explore.commit=tool_channel",
		"explore.report.format=commit_kinds",
	],
	"Explore child only — deposit one return **kind** for the parent (progressive). \
Call after each useful batch of reads (not a final essay). \
`kind` must be a parent-requested return kind \
(paths_read|file_summaries|key_symbols|code_snippets|structure_map|gaps). \
`body` = markdown facts for **that kind only** — no CoT/think tags, no essay openers \
(\"Let me…\"), no `## <other_kind>` headings (engine rejects multi-kind paste). \
`append` (optional bool) concatenates onto a previous commit for the same kind. \
Effect: in-memory; engine writes artifacts at end of Explore. \
Format: {\"kind\":\"…\",\"body\":\"…\",\"append\"?:false}."
);

// ── Core FS / search ────────────────────────────────────────────────────────

tool_prompt!(
	GREP_TOOL_DESCRIPTION,
	GREP_TOOL_ENTRY,
	"tools.grep.description",
	"grep",
	"Searches for a regex in workspace files (respects `.gitignore` and **`.droxignore`**, limit 300 matches). \
         **Permissive** UTF-8 reading (partially binary files skipped without failing the entire search). \
         Option `glob`: limit to relative paths that match (e.g. `**/*.ts`)."
);

tool_prompt!(
	GLOB_TOOL_DESCRIPTION,
	GLOB_TOOL_ENTRY,
	"tools.glob.description",
	"glob",
	"Lists paths (files AND directories) matching a glob pattern under the workspace. \
         Respects `.gitignore` indirectly via post-filter **`.droxignore`** (omitted paths in `droxignore_omitted`). \
         Output: `files`, `directories`, `truncated`, `directory_fanout_caps`, `droxignore_omitted`. \
         Use `*` for the first level, `**/*.ext` for an extension."
);

tool_prompt!(
	BASH_TOOL_DESCRIPTION,
	BASH_TOOL_ENTRY,
	"tools.bash.description",
	"bash",
	"Runs a shell command in the workspace (cmd.exe /C on Windows — not PowerShell; \
         sh -c elsewhere). No stdin. Inspect-only commands are allowed before todo_write: \
         git status/log/diff, ls/dir, pipelines that only filter text \
         (grep/rg/findstr/awk/sed without -i), cargo check, … — do NOT call todo_write \
         just to unlock those. Mutating shell (git add/commit, rm, sed -i, `> file`, …) \
         requires a plan. On Windows: prefer `dir`/`findstr` over Unix ls/grep; avoid \
         bash heredocs and nested quotes in `git commit -m`; use `file_write` + \
         `git commit -F <file>` instead. \
         Returns { command, exit_code, stdout, stderr, timed_out, duration_ms }."
);

tool_prompt!(
	FILE_WRITE_TOOL_DESCRIPTION,
	FILE_WRITE_TOOL_ENTRY,
	"tools.file_write.description",
	"file_write",
	"Writes a text file under the workspace. In `apply_fs_writes` mode, writes to disk; otherwise returns a JSON proposal."
);

tool_prompt!(
	FILE_EDIT_TOOL_DESCRIPTION,
	FILE_EDIT_TOOL_ENTRY,
	"tools.file_edit.description",
	"file_edit",
	"Edits a text file via (old_string, new_string) pairs. \
         old_string must appear exactly once unless replace_all=true. \
         In apply mode, writes to disk; otherwise returns content+diff."
);

tool_prompt!(
	DELETE_PATH_TOOL_DESCRIPTION,
	DELETE_PATH_TOOL_ENTRY,
	"tools.delete_path.description",
	"delete_path",
	"Deletes a file or directory strictly under the workspace. \
         Prefer this tool over `bash rm -rf` (paths, Windows quoting). \
         Format: {\"path\":\"relative/path\",\"recursive\"?:true}. \
         `recursive:false` on a directory only deletes it if empty."
);

tool_prompt!(
	COPY_PATH_TOOL_DESCRIPTION,
	COPY_PATH_TOOL_ENTRY,
	"tools.copy_path.description",
	"copy_path",
	"Copies a **file** to another destination strictly under the workspace. \
         Prefer this tool over `bash copy` / `cp` / `robocopy`. \
         Format: {\"source\": \"…\", \"destination\": \"…\", \"createDirs\"?: true}. \
         Does not copy entire directories (use multiple calls or `glob` + copy file by file)."
);

tool_prompt!(
	NOTEBOOK_EDIT_TOOL_DESCRIPTION,
	NOTEBOOK_EDIT_TOOL_ENTRY,
	"tools.notebook_edit.description",
	"notebook_edit",
	"Edits a Jupyter notebook (.ipynb). Each entry in `edits` targets a cell by \
         `cell_index` (0-based). Mode `replace` (default): old_string → new_string in the source \
         (like file_edit; empty old_string = replace entire source). Mode `insert`: \
         new cell at index (`new_string`, `cell_type` code|markdown). Mode `delete`: \
         removes the cell. Example: \
         {\"path\":\"nb.ipynb\",\"edits\":[{\"cell_index\":1,\"old_string\":\"a\",\"new_string\":\"b\"}]}"
);

// ── Planning / ask ──────────────────────────────────────────────────────────

tool_prompt!(
	TODO_WRITE_TOOL_DESCRIPTION,
	TODO_WRITE_TOOL_ENTRY,
	"tools.todo_write.description",
	"todo_write",
	"Creates / updates the to-do list for the current session. The engine \
         requires **at least one call per user response**, even for a \
         single step (e.g. \"Answer the question\"): list your micro-tasks \
         then update them as you go. \
         Always send **the full list**: replace mode, previous state \
         is overwritten. Statuses: `pending` | `in_progress` | `completed` | \
         `cancelled`. Keep at most **one** item in `in_progress` at a time. \
         Mark `in_progress` BEFORE starting a step, `completed` \
         IMMEDIATELY after.\n\n\
         REQUIRED input format — an object with ONE `todos` key containing \
         an array of items `{ id, content, status }`:\n\
         {\"todos\": [ {\"id\": \"1\", \"content\": \"Answer the question\", \"status\": \"in_progress\"} ]}\n\
         Do NOT send a flat object `{id, content, status}` or a bare array: \
         always use the wrapper `todos: [...]`."
);

tool_prompt!(
	ASK_USER_QUESTION_TOOL_DESCRIPTION,
	ASK_USER_QUESTION_TOOL_ENTRY,
	"tools.ask_user_question.description",
	"ask_user_question",
	"Asks one or more questions to the human and waits for answers. \
         Call via native tool_calls (no JSON in assistant text). \
         Recommended form (minimal example): \
         `{\"questions\":[{\"prompt\":\"What text on the homepage?\",\
         \"options\":[{\"id\":\"a\",\"label\":\"Short\"},{\"id\":\"b\",\"label\":\"Long\"}],\
         \"allowFreeText\":true}]}`. \
         Legacy single: `{\"question\":\"…\",\"choices\":[\"A\",\"B\"]}`. \
         Use whenever non-trivial uncertainty changes upcoming actions \
         (architecture, scope, tech choices) before any mutation. \
         The run is paused until answered; the user can skip \
         a question (`skipped: true` field in the corresponding response)."
);

tool_prompt!(
	COURSE_PLAN_WRITE_TOOL_DESCRIPTION,
	COURSE_PLAN_WRITE_TOOL_ENTRY,
	"tools.course_plan_write.description",
	"course_plan_write",
	"Creates or updates the **course plan** (Professor mode). Full list \
         in replace mode. Each lesson alternates teaching + exercise; \
         include a final `checkpoint` if relevant.\n\n\
         Format: `{ \"courseTitle\": \"…\", \"steps\": [{ \"id\", \"title\", \
         \"kind\": \"lesson|exercise|checkpoint\", \"status\": \"pending|active|mastered|skipped\", \
         \"workArea\"?: { \"strategy\", \"primaryPaths\", \"referencePaths\", \"rationale\" } }] }`.\n\n\
         At most **one** `active` step. For `exercise` / `checkpoint` steps, \
         fill in `workArea` (where the student works in the open repo)."
);

tool_prompt!(
	EXIT_PLAN_MODE_TOOL_DESCRIPTION,
	EXIT_PLAN_MODE_TOOL_ENTRY,
	"tools.exit_plan_mode.description",
	"exit_plan_mode",
	"Presents a finalized plan to the human and asks for approval to \
         exit plan mode and proceed to execution."
);

tool_prompt!(
	SCOPE_DEFER_TOOL_DESCRIPTION,
	SCOPE_DEFER_TOOL_ENTRY,
	"tools.scope_defer.description",
	"scope_defer",
	"Defers an **out-of-scope** discovery from the user request (inconsistency, debt, \
         parallel lead) without addressing it. Use when exploring and finding something \
         interesting but **not requested** — then continue toward the locked objective. \
         Format: {\"finding\": \"…\", \"reason\": \"…\"}."
);

// ── IDE / LSP / web ─────────────────────────────────────────────────────────

tool_prompt!(
	LSP_TOOL_DESCRIPTION,
	LSP_TOOL_ENTRY,
	"tools.lsp.description",
	"lsp",
	"Queries the Language Server Protocol via VS Code (diagnostics, \
         definition, references, hover, symbol search). \
         **Semantic** search (by symbol) rather than textual like \
         `grep`. Requires an active language server on the editor side \
         (rust-analyzer, tsserver, pyright…). \
         Operations: `diagnostics` | `workspace_symbol` | `definition` | \
         `references` | `hover`. Positions are 0-indexed (LSP). For \
         position-based operations, provide either `position` or `symbol` \
         (the client will find the first occurrence in `path`)."
);

tool_prompt!(
	WEB_SEARCH_TOOL_DESCRIPTION,
	WEB_SEARCH_TOOL_ENTRY,
	"tools.web_search.description",
	"web_search",
	"Web search (DuckDuckGo) from a natural-language query. \
         Returns a list of results { title, url, snippet }. \
         Use `web_fetch` next to read the content of a chosen URL."
);

tool_prompt!(
	WEB_FETCH_TOOL_DESCRIPTION,
	WEB_FETCH_TOOL_ENTRY,
	"tools.web_fetch.description",
	"web_fetch",
	"Downloads an HTTP(S) URL and extracts text. HTML: script/style tags filtered. \
         Max size: 2 MiB, returned text truncated at 32 KiB."
);

tool_prompt!(
	CODEBASE_SEARCH_TOOL_DESCRIPTION,
	CODEBASE_SEARCH_TOOL_ENTRY,
	"tools.codebase_search.description",
	"codebase_search",
	"Searches the workspace **local codebase index** (lexical + MiniLM hybrid). \
         Returns relevant code chunks with path/line ranges for grounding. \
         Prefer this over blind grepping when looking for behavior or concepts. \
         **Execution**: IDE client (Drox); unavailable outside delegated client. \
         Format: `{ \"query\": \"…\", \"limit\"?: N, \"path_prefix\"?: \"src/…\" }`."
);

// ── Memory / session / skills ───────────────────────────────────────────────

tool_prompt!(
	SESSION_NOTE_TOOL_DESCRIPTION,
	SESSION_NOTE_TOOL_ENTRY,
	"tools.session_note.description",
	"session_note",
	"Pins a working note (≤ 500 chars) that will be included in the \
         persistent session summary at the end of the run. Use to \
         record a non-trivial technical decision, a hypothesis to \
         verify, or a blocking point — NOT to narrate the previous tool \
         or announce a plan. Effect: in-memory append, zero I/O. \
         Format: {\"content\": \"…\"}."
);

tool_prompt!(
	SESSION_SEARCH_TOOL_DESCRIPTION,
	SESSION_SEARCH_TOOL_ENTRY,
	"tools.session_search.description",
	"session_search",
	"Searches the workspace **long-term memory** (indexed compaction summaries \
         + session closures). Returns the most relevant excerpts \
         to enrich context. **Execution**: IDE client (Drox extension); \
         unavailable outside delegated client. Format: `{ \"query\": \"…\", \"limit\"?: N }`."
);

tool_prompt!(
	SESSION_END_TOOL_DESCRIPTION,
	SESSION_END_TOOL_ENTRY,
	"tools.session_end.description",
	"session_end",
	"Explicitly closes the current work session when \
         the user has signaled the end (e.g. \"we're done for today\"). \
         After success: a brief farewell / summary in `answering`, \
         then `[phase: done]`. **In the Drox client (VS Code)** this call is \
         executed on the IDE side (indexed archiving); outside delegated client, the tool \
         is unavailable. Format: `{ \"farewell_hint\"?: \"…\" }`."
);

tool_prompt!(
	SESSION_COMPACT_TOOL_DESCRIPTION,
	SESSION_COMPACT_TOOL_ENTRY,
	"tools.session_compact.description",
	"session_compact",
	"Forces an **LLM compaction** on the current session JSONL transcript \
         (`session.compact`) — same pipeline as the `/compact` command. \
         Reduces persisted history and returns a structured summary (objective, \
         files, markdown body). **Execution**: IDE client (Drox extension); \
         unavailable outside delegation. Prefer a moment when the transcript is not \
         under heavy concurrent writes. Format: `{ \"reason\"?: \"…\" }`."
);

tool_prompt!(
	MEMORY_LIST_TOOL_DESCRIPTION,
	MEMORY_LIST_TOOL_ENTRY,
	"tools.memory_list.description",
	"memory_list",
	"Lists archived workspace sessions (`.drox/memory/sessions/`), \
         sorted from most recent to oldest. Read-only. Returns \
         {slug, date, objective, files_touched, model} for each entry, \
         not the body — use `memory_read` to reload a specific session. \
         Format: {\"limit\": 10} (optional, default 10, max 50)."
);

tool_prompt!(
	MEMORY_READ_TOOL_DESCRIPTION,
	MEMORY_READ_TOOL_ENTRY,
	"tools.memory_read.description",
	"memory_read",
	"Reloads the full content (front-matter + markdown body) of an \
         archived workspace session, from its short slug (front-matter \
         `slug` field — **without** the date-time prefix of the \
         filename). Read-only. Returns the text as-is — \
         extract what is relevant for the current task yourself. \
         Format: {\"slug\": \"…\"}."
);

tool_prompt!(
	SKILL_LIST_TOOL_DESCRIPTION,
	SKILL_LIST_TOOL_ENTRY,
	"tools.skill_list.description",
	"skill_list",
	"Lists local workspace skills (`.drox/skills/*/SKILL.md`), \
         sorted by name. Read-only. Returns name, description, when_to_use \
         — not the body (use `skill_read`). Format: {{}}."
);

tool_prompt!(
	SKILL_READ_TOOL_DESCRIPTION,
	SKILL_READ_TOOL_ENTRY,
	"tools.skill_read.description",
	"skill_read",
	"Loads the full SKILL.md file of a local workspace skill \
         (`.drox/skills/<name>/SKILL.md`). Read-only. Call before \
         applying instructions from a skill listed at run startup. \
         Format: {\"name\": \"…\"}."
);

// ── Workspace map / git worktree ────────────────────────────────────────────

tool_prompt!(
	WORKSPACE_MAP_READ_TOOL_DESCRIPTION,
	WORKSPACE_MAP_READ_TOOL_ENTRY,
	"tools.workspace_map_read.description",
	"workspace_map_read",
	"Reads the persistent workspace structure map (`.drox/workspace-map.json`): \
         zones, roles, pivots. Use it before a broad `glob` if the system prompt \
         mentions a fresh version."
);

tool_prompt!(
	WORKSPACE_MAP_NOTE_TOOL_DESCRIPTION,
	WORKSPACE_MAP_NOTE_TOOL_ENTRY,
	"tools.workspace_map_note.description",
	"workspace_map_note",
	"Adds or updates a **semantic note** on the workspace map (zone, role, \
         pivot). Use after exploration to capture what a folder is for without \
         relisting the entire repo."
);

tool_prompt!(
	GIT_WORKTREE_ENTER_TOOL_DESCRIPTION,
	GIT_WORKTREE_ENTER_TOOL_ENTRY,
	"tools.git_worktree_enter.description",
	"git_worktree_enter",
	"Creates (or resumes) a git worktree under `.drox/worktrees/<name>/` with a \
         `worktree-<name>` branch, then switches file/bash tools to this \
         worktree for the rest of the run. Use only if the user explicitly requests \
         a worktree. Format: {\"name\": \"feature-x\"} (optional)."
);

tool_prompt!(
	GIT_WORKTREE_EXIT_TOOL_DESCRIPTION,
	GIT_WORKTREE_EXIT_TOOL_ENTRY,
	"tools.git_worktree_exit.description",
	"git_worktree_exit",
	"Exits the worktree session opened by git_worktree_enter. \
         action=keep preserves the directory; action=remove destroys it (discard_changes: \
         true required if there are unmerged files/commits). \
         Format: {\"action\": \"keep\"} or {\"action\": \"remove\", \"discard_changes\": true}."
);

// ── MCP fallbacks (static) ──────────────────────────────────────────────────

tool_prompt!(
	MCP_CALL_TOOL_DESCRIPTION,
	MCP_CALL_TOOL_ENTRY,
	"tools.mcp_call.description",
	"mcp_call",
	"Invokes a tool on a configured MCP server (`.mcp.json`). \
         Used as fallback if `mcp__*` stubs could not be loaded."
);

tool_prompt!(
	LIST_MCP_RESOURCES_TOOL_DESCRIPTION,
	LIST_MCP_RESOURCES_TOOL_ENTRY,
	"tools.list_mcp_resources.description",
	"list_mcp_resources",
	"Lists available MCP resources. Each entry includes a `server` field."
);

tool_prompt!(
	READ_MCP_RESOURCE_TOOL_DESCRIPTION,
	READ_MCP_RESOURCE_TOOL_ENTRY,
	"tools.read_mcp_resource.description",
	"read_mcp_resource",
	"Reads an MCP resource by URI on the specified server."
);

/// Toutes les fiches descriptions d'outils (hors stubs MCP dynamiques serveur).
#[must_use]
pub fn all_tool_entries() -> &'static [PromptEntry] {
	&TOOL_ENTRIES
}

static TOOL_ENTRIES: [PromptEntry; 37] = [
	FILE_READ_TOOL_ENTRY,
	TASK_TOOL_ENTRY,
	EXPLORE_INDEX_LIST_TOOL_ENTRY,
	EXPLORE_ARTIFACT_READ_TOOL_ENTRY,
	EXPLORE_COMMIT_TOOL_ENTRY,
	GREP_TOOL_ENTRY,
	GLOB_TOOL_ENTRY,
	BASH_TOOL_ENTRY,
	FILE_WRITE_TOOL_ENTRY,
	FILE_EDIT_TOOL_ENTRY,
	DELETE_PATH_TOOL_ENTRY,
	COPY_PATH_TOOL_ENTRY,
	NOTEBOOK_EDIT_TOOL_ENTRY,
	TODO_WRITE_TOOL_ENTRY,
	ASK_USER_QUESTION_TOOL_ENTRY,
	COURSE_PLAN_WRITE_TOOL_ENTRY,
	EXIT_PLAN_MODE_TOOL_ENTRY,
	SCOPE_DEFER_TOOL_ENTRY,
	LSP_TOOL_ENTRY,
	WEB_SEARCH_TOOL_ENTRY,
	WEB_FETCH_TOOL_ENTRY,
	CODEBASE_SEARCH_TOOL_ENTRY,
	SESSION_NOTE_TOOL_ENTRY,
	SESSION_SEARCH_TOOL_ENTRY,
	SESSION_END_TOOL_ENTRY,
	SESSION_COMPACT_TOOL_ENTRY,
	MEMORY_LIST_TOOL_ENTRY,
	MEMORY_READ_TOOL_ENTRY,
	SKILL_LIST_TOOL_ENTRY,
	SKILL_READ_TOOL_ENTRY,
	WORKSPACE_MAP_READ_TOOL_ENTRY,
	WORKSPACE_MAP_NOTE_TOOL_ENTRY,
	GIT_WORKTREE_ENTER_TOOL_ENTRY,
	GIT_WORKTREE_EXIT_TOOL_ENTRY,
	MCP_CALL_TOOL_ENTRY,
	LIST_MCP_RESOURCES_TOOL_ENTRY,
	READ_MCP_RESOURCE_TOOL_ENTRY,
];
