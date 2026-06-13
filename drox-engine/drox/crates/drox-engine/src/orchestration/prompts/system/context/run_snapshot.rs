//! Snapshot factuel du run architecte (`CTX-run-snapshot`).

use crate::agent::{ArchitectRunState, ARCHITECT_RUN_SNAPSHOT_MARKER};
use crate::RunStation;

const TOP_WORKSPACE_PATHS: usize = 8;

/// Profil d'injection : tour courant, post-compaction, ou compact par station rail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunSnapshotProfile {
    PerTurn,
    PostCompaction,
    ForStation(RunStation),
}

#[derive(Debug, Clone, Copy, Default)]
struct SectionFlags {
    user_request: bool,
    run_objective: bool,
    plan_todos: bool,
    plan_todos_one_line: bool,
    focus_task: bool,
    workspace_paths: bool,
}

#[must_use]
fn section_flags_for_profile(profile: RunSnapshotProfile) -> SectionFlags {
    match profile {
        RunSnapshotProfile::PerTurn | RunSnapshotProfile::PostCompaction => SectionFlags {
            user_request: true,
            run_objective: true,
            plan_todos: true,
            plan_todos_one_line: false,
            focus_task: true,
            workspace_paths: true,
        },
        RunSnapshotProfile::ForStation(station) => section_flags_for_station(station),
    }
}

#[must_use]
fn section_flags_for_station(station: RunStation) -> SectionFlags {
    match station {
        RunStation::Intent | RunStation::Read => SectionFlags {
            user_request: true,
            run_objective: true,
            plan_todos: false,
            plan_todos_one_line: false,
            focus_task: false,
            workspace_paths: false,
        },
        RunStation::Plan | RunStation::Propose => SectionFlags {
            user_request: true,
            run_objective: false,
            plan_todos: true,
            plan_todos_one_line: false,
            focus_task: false,
            workspace_paths: false,
        },
        RunStation::Act => SectionFlags {
            user_request: false,
            run_objective: false,
            plan_todos: true,
            plan_todos_one_line: false,
            focus_task: true,
            workspace_paths: false,
        },
        RunStation::Verify => SectionFlags {
            user_request: false,
            run_objective: false,
            plan_todos: false,
            plan_todos_one_line: false,
            focus_task: true,
            workspace_paths: false,
        },
        RunStation::Answer => SectionFlags {
            user_request: true,
            run_objective: false,
            plan_todos: false,
            plan_todos_one_line: true,
            focus_task: false,
            workspace_paths: false,
        },
    }
}

#[must_use]
pub fn architect_run_context_block(
    state: &ArchitectRunState,
    live_run_objective: Option<&str>,
    profile: RunSnapshotProfile,
) -> String {
    let flags = section_flags_for_profile(profile);

    let mut block = format!(
        "{ARCHITECT_RUN_SNAPSHOT_MARKER}\n\n\
         Factual run state (engine) — do not invent goals or plan lines missing below.\n"
    );

    if flags.user_request {
        block.push_str("\n### User request\n");
        if let Some(req) = state.user_request_anchor.as_deref() {
            block.push_str("> ");
            block.push_str(req);
            block.push('\n');
        } else {
            block.push_str("> *(not captured)*\n");
        }
    }

    if flags.run_objective {
        let objective = live_run_objective
            .or(state.run_objective_anchor.as_deref())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(obj) = objective {
            block.push_str("\n### Run objective\n> ");
            block.push_str(obj);
            block.push('\n');
        }
    }

    if flags.plan_todos {
        block.push_str("\n### Plan / todos\n");
        block.push_str(&state.format_plan_snapshot_public());
        block.push('\n');
    } else if flags.plan_todos_one_line {
        block.push_str("\n### Plan / todos\n> ");
        block.push_str(&state.format_todos_summary_one_line());
        block.push('\n');
    }

    if flags.focus_task {
        if let Some((id, label, status)) = state.current_focus_task_line() {
            block.push_str("\n### Focus task (current)\n");
            block.push_str(&format!("> **{id}** [{status}] — {label}\n"));
        }
    }

    if flags.workspace_paths && state.workspace_map_loaded && !state.workspace_paths.is_empty() {
        block.push_str("\n### Workspace paths (sample)\n");
        block.push_str(&format_top_workspace_paths(state));
        block.push('\n');
    }

    block
}

#[must_use]
pub fn architect_run_context_block_per_turn(
    state: &ArchitectRunState,
    live_run_objective: Option<&str>,
    rail_station: Option<RunStation>,
) -> String {
    match rail_station {
        Some(station) => architect_run_context_block(
            state,
            live_run_objective,
            RunSnapshotProfile::ForStation(station),
        ),
        None => architect_run_context_block(state, live_run_objective, RunSnapshotProfile::PerTurn),
    }
}

#[must_use]
pub fn architect_run_context_block_compaction(
    state: &ArchitectRunState,
    live_run_objective: Option<&str>,
) -> String {
    architect_run_context_block(state, live_run_objective, RunSnapshotProfile::PostCompaction)
}

#[must_use]
fn format_top_workspace_paths(state: &ArchitectRunState) -> String {
    let mut paths: Vec<_> = state.workspace_paths.iter().cloned().collect();
    paths.sort();
    paths.truncate(TOP_WORKSPACE_PATHS);
    if paths.is_empty() {
        return "> *(none)*\n".to_string();
    }
    paths
        .into_iter()
        .map(|p| format!("- `{p}`"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::ArchitectRunState;

    #[test]
    fn per_turn_includes_user_request() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Fix login");
        let block = architect_run_context_block_per_turn(&st, None, None);
        assert!(block.contains(ARCHITECT_RUN_SNAPSHOT_MARKER));
        assert!(block.contains("Fix login"));
        assert!(!block.contains("### Last delegate\n"));
    }

    #[test]
    fn compaction_profile_matches_per_turn_sections() {
        let mut st = ArchitectRunState::new();
        st.todo_statuses.insert("t1".into(), "pending".into());
        let block = architect_run_context_block_compaction(&st, None);
        assert!(block.contains("**t1** [pending]"));
        assert!(!block.contains("Architect cycle checkpoint"));
        assert!(!block.contains("delegate_executor"));
    }

    #[test]
    fn read_station_omits_todos_and_workspace_sample() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Explore repo");
        st.todo_statuses.insert("t1".into(), "pending".into());
        st.workspace_map_loaded = true;
        st.workspace_paths.insert("src/a.ts".into());
        let full = architect_run_context_block_per_turn(&st, None, None);
        let read = architect_run_context_block_per_turn(&st, None, Some(RunStation::Read));
        assert!(full.contains("### Plan / todos"));
        assert!(full.contains("### Workspace paths"));
        assert!(!read.contains("### Plan / todos"));
        assert!(!read.contains("### Workspace paths"));
        assert!(read.contains("Explore repo"));
        assert!(read.len() < full.len());
    }

    #[test]
    fn answer_station_uses_one_line_todos() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Ship it");
        st.todo_statuses.insert("t1".into(), "completed".into());
        st.task_labels.insert("t1".into(), "Fix SVG".into());
        let block =
            architect_run_context_block_per_turn(&st, None, Some(RunStation::Answer));
        assert!(block.contains("t1:completed"));
        assert!(!block.contains("**t1** [completed]"));
    }

    #[test]
    fn act_station_keeps_focus_and_todos() {
        let mut st = ArchitectRunState::new();
        st.todo_statuses.insert("t1".into(), "in_progress".into());
        st.task_labels.insert("t1".into(), "Rewrite component".into());
        let block = architect_run_context_block_per_turn(&st, None, Some(RunStation::Act));
        assert!(block.contains("### Focus task"));
        assert!(block.contains("### Plan / todos"));
        assert!(!block.contains("### User request"));
    }
}
