//! Snapshot factuel du run architecte (`CTX-run-snapshot`).

use crate::agent::{ArchitectRunState, ARCHITECT_RUN_SNAPSHOT_MARKER};

const TOP_WORKSPACE_PATHS: usize = 8;

/// Profil d'injection : tour courant ou post-compaction (checkpoint table).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunSnapshotProfile {
    PerTurn,
    PostCompaction,
}

#[derive(Debug, Clone, Copy, Default)]
struct SectionFlags {
    focus_task: bool,
    workspace_paths: bool,
}

#[must_use]
fn section_flags_for_profile(profile: RunSnapshotProfile) -> SectionFlags {
    match profile {
        RunSnapshotProfile::PerTurn | RunSnapshotProfile::PostCompaction => SectionFlags {
            focus_task: true,
            workspace_paths: true,
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

    block.push_str("\n### User request\n");
    if let Some(req) = state.user_request_anchor.as_deref() {
        block.push_str("> ");
        block.push_str(req);
        block.push('\n');
    } else {
        block.push_str("> *(not captured)*\n");
    }

    let objective = live_run_objective
        .or(state.run_objective_anchor.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(obj) = objective {
        block.push_str("\n### Run objective\n> ");
        block.push_str(obj);
        block.push('\n');
    }

    block.push_str("\n### Plan / todos\n");
    block.push_str(&state.format_plan_snapshot_public());
    block.push('\n');

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
) -> String {
    architect_run_context_block(state, live_run_objective, RunSnapshotProfile::PerTurn)
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
        let block = architect_run_context_block_per_turn(&st, None);
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
}
