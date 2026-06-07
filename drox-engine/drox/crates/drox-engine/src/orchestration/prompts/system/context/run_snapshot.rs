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
    last_delegate: bool,
    verified_ids: bool,
    workspace_paths: bool,
    cycle_sanity: bool,
    compaction_checkpoint: bool,
}

#[must_use]
fn section_flags_for_profile(profile: RunSnapshotProfile) -> SectionFlags {
    match profile {
        RunSnapshotProfile::PerTurn => SectionFlags {
            focus_task: true,
            last_delegate: true,
            verified_ids: true,
            workspace_paths: true,
            cycle_sanity: true,
            compaction_checkpoint: false,
        },
        RunSnapshotProfile::PostCompaction => SectionFlags {
            focus_task: true,
            last_delegate: true,
            verified_ids: true,
            workspace_paths: true,
            cycle_sanity: true,
            compaction_checkpoint: true,
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

    if let Some(mode) = state.work_mode_anchor {
        block.push_str("\n### Work mode\n> ");
        block.push_str(mode.as_str());
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

    if flags.last_delegate && state.last_delegate_task_id.is_some() {
        block.push_str("\n### Last delegate\n");
        block.push_str(&state.format_last_delegate_snapshot());
        block.push('\n');
    }

    if flags.verified_ids && !state.verified_task_ids.is_empty() {
        let mut ids: Vec<_> = state.verified_task_ids.iter().collect();
        ids.sort();
        block.push_str("\n### Verified task ids\n> ");
        block.push_str(
            &ids.into_iter()
                .map(|s| format!("`{s}`"))
                .collect::<Vec<_>>()
                .join(", "),
        );
        block.push('\n');
    }

    if flags.workspace_paths && state.workspace_map_loaded && !state.workspace_paths.is_empty() {
        block.push_str("\n### Workspace paths (sample)\n");
        block.push_str(&format_top_workspace_paths(state));
        block.push('\n');
    }

    if flags.cycle_sanity {
        block.push_str("\n### Cycle sanity\n> ");
        block.push_str(state.cycle_sanity.as_str());
        block.push('\n');
        if let Some(note) = state.cycle_sanity_note.as_deref() {
            block.push_str(&format!("> note: {note}\n"));
        }
    }

    if flags.compaction_checkpoint {
        block.push_str("\n\n");
        block.push_str(&state.cycle_checkpoint_block());
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
    use crate::orchestration::DelegateStatus;

    #[test]
    fn per_turn_includes_delegate_when_present() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Fix login");
        st.last_delegate_task_id = Some("t1".into());
        st.last_delegate_status = Some(DelegateStatus::Completed);
        let block = architect_run_context_block_per_turn(&st, None);
        assert!(block.contains(ARCHITECT_RUN_SNAPSHOT_MARKER));
        assert!(block.contains("Fix login"));
        assert!(block.contains("### Last delegate\n"));
    }

    #[test]
    fn compaction_includes_checkpoint_table() {
        let mut st = ArchitectRunState::new();
        st.todo_statuses.insert("t1".into(), "pending".into());
        let block = architect_run_context_block_compaction(&st, None);
        assert!(block.contains("Architect cycle checkpoint"));
    }
}
