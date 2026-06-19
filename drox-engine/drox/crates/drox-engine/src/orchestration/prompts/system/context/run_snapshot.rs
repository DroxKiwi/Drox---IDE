//! Snapshot factuel du run architecte (`CTX-run-snapshot`).

use crate::agent::{ArchitectRunState, ARCHITECT_RUN_SNAPSHOT_MARKER};
use crate::RunStation;

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
    focus_step: bool,
}

#[must_use]
fn section_flags_for_profile(profile: RunSnapshotProfile) -> SectionFlags {
    match profile {
        RunSnapshotProfile::PerTurn | RunSnapshotProfile::PostCompaction => SectionFlags {
            user_request: true,
            run_objective: true,
            focus_step: true,
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
            focus_step: false,
        },
        RunStation::Plan | RunStation::Propose => SectionFlags {
            user_request: true,
            run_objective: false,
            focus_step: false,
        },
        RunStation::Act | RunStation::Verify => SectionFlags {
            user_request: false,
            run_objective: false,
            focus_step: true,
        },
        RunStation::Answer => SectionFlags {
            user_request: true,
            run_objective: false,
            focus_step: false,
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

    if flags.focus_step {
        if let Some((id, action, status)) = state.current_focus_step_line() {
            block.push_str("\n### Focus step (current)\n");
            block.push_str(&format!("> **{id}** [{status}] — {action}\n"));
        }
    }

    if let Some(target) = state.diagnostic_target.as_ref() {
        if matches!(
            profile,
            RunSnapshotProfile::PerTurn
                | RunSnapshotProfile::PostCompaction
                | RunSnapshotProfile::ForStation(RunStation::Read)
                | RunSnapshotProfile::ForStation(RunStation::Act)
                | RunSnapshotProfile::ForStation(RunStation::Verify)
        ) {
            block.push_str(&target.snapshot_block());
        }
    }

    if let RunSnapshotProfile::ForStation(station) = profile {
        block.push_str("\n### Rail station (inferred)\n> ");
        block.push_str(station.as_str());
        block.push('\n');
    }

    if profile == RunSnapshotProfile::PostCompaction {
        block.push_str(
            "\n### Context compaction (engine)\n\
             > History before this snapshot was summarized. **Trust this block** for user request \
             and objective — internal plan lives in a separate snapshot block.\n",
        );
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
    rail_station: Option<RunStation>,
    files_touched: &[String],
) -> String {
    let mut block =
        architect_run_context_block(state, live_run_objective, RunSnapshotProfile::PostCompaction);
    if let Some(station) = rail_station {
        block.push_str("\n### Rail station (inferred)\n> ");
        block.push_str(station.as_str());
        block.push('\n');
    }
    if !files_touched.is_empty() {
        block.push_str("\n### Files touched (session)\n");
        for path in files_touched.iter().take(12) {
            block.push_str("- `");
            block.push_str(path);
            block.push_str("`\n");
        }
    }
    block
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::ingest_internal_plan;
    use crate::agent::ArchitectRunState;
    use serde_json::json;

    #[test]
    fn per_turn_includes_user_request() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Fix login");
        let block = architect_run_context_block_per_turn(&st, None, None);
        assert!(block.contains(ARCHITECT_RUN_SNAPSHOT_MARKER));
        assert!(block.contains("Fix login"));
        assert!(!block.contains("### Plan / todos"));
        assert!(!block.contains("### Workspace paths"));
    }

    #[test]
    fn compaction_profile_omits_internal_plan() {
        let mut st = ArchitectRunState::new();
        let _ = ingest_internal_plan(
            &mut st.internal_plan,
            json!({"steps":[{"id":"s1","action":"Fix","status":"pending"}]}),
        );
        let block = architect_run_context_block_compaction(&st, None, None, &[]);
        assert!(!block.contains("**s1** [pending]"));
        assert!(block.contains("Context compaction (engine)"));
    }

    #[test]
    fn diagnostic_target_in_read_station_snapshot() {
        use crate::agent::DiagnosticTarget;

        let mut st = ArchitectRunState::new();
        st.diagnostic_target = Some(DiagnosticTarget {
            workspace_relative_path: "app-kdds-main/src/foo.tsx".into(),
            line: Some(92),
            column: None,
        });
        let block = architect_run_context_block_per_turn(&st, None, Some(RunStation::Read));
        assert!(block.contains("### Diagnostic target (engine)"));
        assert!(block.contains("app-kdds-main/src/foo.tsx:92"));
    }

    #[test]
    fn read_station_omits_workspace_paths_even_when_map_loaded() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Explore repo");
        st.workspace_map_loaded = true;
        st.workspace_paths.insert("src/a.ts".into());
        let full = architect_run_context_block_per_turn(&st, None, None);
        let read = architect_run_context_block_per_turn(&st, None, Some(RunStation::Read));
        assert!(!full.contains("### Workspace paths"));
        assert!(!read.contains("### Workspace paths"));
        assert!(read.contains("Explore repo"));
    }

    #[test]
    fn act_station_keeps_focus_step() {
        let mut st = ArchitectRunState::new();
        let _ = ingest_internal_plan(
            &mut st.internal_plan,
            json!({
                "steps": [{
                    "id": "s1",
                    "action": "Rewrite component",
                    "status": "in_progress"
                }]
            }),
        );
        let block = architect_run_context_block_per_turn(&st, None, Some(RunStation::Act));
        assert!(block.contains("### Focus step"));
        assert!(block.contains("Rewrite component"));
        assert!(!block.contains("### User request"));
    }
}
