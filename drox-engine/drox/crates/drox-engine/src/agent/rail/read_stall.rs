//! READ stall — N read-only turns at READ on a mutation brief → gentle ACT nudge.

use crate::agent::nudges::{READ_STALL_NUDGE_PROMPT, READ_STALL_STRONG_NUDGE_PROMPT};
use crate::agent::state::internal_plan::InternalPlanState;

use super::policy;
use super::station::RunStation;
use super::state::RunRailState;

const MAX_READ_IDLE_DEFAULT: u32 = 6;
const MAX_READ_IDLE_DIAGNOSIS: u32 = 4;
const STRONG_NUDGE_EXTRA_TURNS: u32 = 2;

#[must_use]
fn fix_step_in_progress(plan: Option<&InternalPlanState>) -> bool {
    let Some(plan) = plan else {
        return false;
    };
    plan.steps.iter().any(|step| {
        if step.status != "in_progress" {
            return false;
        }
        if !step.paths.is_empty() {
            return true;
        }
        let action = step.action.to_ascii_lowercase();
        ["fix", "edit", "apply", "mutate", "write", "patch", "correct"]
            .iter()
            .any(|kw| action.contains(kw))
    })
}

#[must_use]
fn diagnosis_complete(plan: Option<&InternalPlanState>) -> bool {
    let Some(plan) = plan else {
        return false;
    };
    plan.steps.iter().any(|step| {
        if step.status != "completed" {
            return false;
        }
        let action = step.action.to_ascii_lowercase();
        let done = step.done_when.to_ascii_lowercase();
        [
            "cause",
            "identif",
            "root",
            "diagnos",
            "compris",
            "understood",
            "identifiée",
            "identifie",
        ]
        .iter()
        .any(|kw| action.contains(kw) || done.contains(kw))
    })
}

#[must_use]
fn is_read_only_turn(tool_names: &[&str]) -> bool {
    tool_names.is_empty()
        || tool_names.iter().all(|name| {
            matches!(
                *name,
                "internal_plan_write"
                    | "file_read"
                    | "grep"
                    | "lsp"
                    | "workspace_map_read"
                    | "web_search"
                    | "web_fetch"
                    | "memory_read"
                    | "memory_list"
                    | "read_workspace"
                    | "verify_project"
            )
        })
}

#[must_use]
fn read_idle_threshold(plan: Option<&InternalPlanState>) -> u32 {
    if fix_step_in_progress(plan) || diagnosis_complete(plan) {
        MAX_READ_IDLE_DIAGNOSIS
    } else {
        MAX_READ_IDLE_DEFAULT
    }
}

#[must_use]
fn read_stall_nudge(idle_turns: u32, threshold: u32) -> &'static str {
    if idle_turns >= threshold.saturating_add(STRONG_NUDGE_EXTRA_TURNS) {
        READ_STALL_STRONG_NUDGE_PROMPT
    } else {
        READ_STALL_NUDGE_PROMPT
    }
}

/// Record a read-only assistant turn at READ; nudge when threshold reached.
///
/// `tool_names` may be empty for thinking-only turns (no structured tool calls).
#[must_use]
pub fn on_read_idle_turn(
    state: &mut RunRailState,
    mutation_expected: bool,
    tool_names: &[&str],
    plan: Option<&InternalPlanState>,
) -> Option<&'static str> {
    if state.station != RunStation::Read {
        state.read_idle_turns = 0;
        return None;
    }
    if !mutation_expected {
        state.read_idle_turns = 0;
        return None;
    }
    if tool_names
        .iter()
        .any(|name| policy::is_mutation_tool(name) || *name == "edit_file")
    {
        state.read_idle_turns = 0;
        return None;
    }
    if !is_read_only_turn(tool_names) {
        state.read_idle_turns = 0;
        return None;
    }
    state.read_idle_turns = state.read_idle_turns.saturating_add(1);
    let threshold = read_idle_threshold(plan);
    if state.read_idle_turns >= threshold {
        Some(read_stall_nudge(state.read_idle_turns, threshold))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::state::internal_plan::InternalPlanState;

    #[test]
    fn sixth_read_only_turn_nudges() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        for _ in 0..5 {
            assert!(on_read_idle_turn(&mut state, true, &["file_read"], None).is_none());
        }
        assert_eq!(
            on_read_idle_turn(&mut state, true, &["grep"], None),
            Some(READ_STALL_NUDGE_PROMPT)
        );
    }

    #[test]
    fn thinking_only_turns_count_toward_stall() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        for _ in 0..5 {
            assert!(on_read_idle_turn(&mut state, true, &[], None).is_none());
        }
        assert!(on_read_idle_turn(&mut state, true, &[], None).is_some());
    }

    #[test]
    fn edit_file_resets_counter() {
        let mut state = RunRailState {
            station: RunStation::Read,
            read_idle_turns: 5,
            ..RunRailState::new()
        };
        assert!(on_read_idle_turn(&mut state, true, &["edit_file"], None).is_none());
        assert_eq!(state.read_idle_turns, 0);
    }

    #[test]
    fn fix_step_lowers_threshold() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        let plan = InternalPlanState {
            steps: vec![crate::agent::state::internal_plan::InternalPlanStep {
                id: "s4".into(),
                action: "Fix hero text in globals.css".into(),
                paths: vec!["globals.css".into()],
                done_when: String::new(),
                status: "in_progress".into(),
            }],
            meta: Default::default(),
        };
        for _ in 0..3 {
            assert!(on_read_idle_turn(&mut state, true, &["file_read"], Some(&plan)).is_none());
        }
        assert!(on_read_idle_turn(&mut state, true, &["file_read"], Some(&plan)).is_some());
    }

    #[test]
    fn completed_diagnosis_step_lowers_threshold() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        let plan = InternalPlanState {
            steps: vec![crate::agent::state::internal_plan::InternalPlanStep {
                id: "s3".into(),
                action: "Identify root cause".into(),
                paths: vec![],
                done_when: "cause identifiée".into(),
                status: "completed".into(),
            }],
            meta: Default::default(),
        };
        for _ in 0..3 {
            assert!(on_read_idle_turn(&mut state, true, &[], Some(&plan)).is_none());
        }
        assert!(on_read_idle_turn(&mut state, true, &[], Some(&plan)).is_some());
    }

    #[test]
    fn strong_nudge_after_extra_idle_turns() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        let plan = InternalPlanState {
            steps: vec![crate::agent::state::internal_plan::InternalPlanStep {
                id: "s3".into(),
                action: "Identify root cause".into(),
                paths: vec![],
                done_when: "cause identifiée".into(),
                status: "completed".into(),
            }],
            meta: Default::default(),
        };
        for _ in 0..5 {
            let _ = on_read_idle_turn(&mut state, true, &[], Some(&plan));
        }
        assert_eq!(
            on_read_idle_turn(&mut state, true, &[], Some(&plan)),
            Some(READ_STALL_STRONG_NUDGE_PROMPT)
        );
    }
}
