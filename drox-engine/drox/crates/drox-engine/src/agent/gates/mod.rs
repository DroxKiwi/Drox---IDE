//! Gates moteur : blocages avant clôture `[phase: done]` ou exécution d'outil.
//!
//! Gates pré-exécution et clôture ; `RunSpec::gate_enabled` active/désactive par rôle.

use serde_json::Value;

use crate::event::Phase;
use crate::EngineTuning;
use crate::run_spec::{GateKind, RoleId, RunSpec};

use crate::agent::state::ArchitectRunState;

use super::phases::phase_from_name_token;

mod bash_windows;
mod todo_shape;
pub(crate) use bash_windows::{verify_bash_failure_hint, VERIFY_WINDOWS_SHELL_REMINDER};
pub(crate) use todo_shape::todo_payload_shape_guard;

include!("done.rs");
include!("record.rs");
include!("tool_pre.rs");

#[cfg(test)]
mod tests {
    use super::*;
    use crate::EngineTuning;
    use crate::agent::ArchitectRunState;
    use serde_json::json;

    #[test]
    fn hallucinated_phase_tool_detects_common_variants() {
        assert!(is_hallucinated_phase_tool_call("phase", &json!({ "done": "" })));
        assert!(is_hallucinated_phase_tool_call("Phase:", &json!({ "done": "" })));
        assert!(is_hallucinated_phase_tool_call("phase:done", &json!({})));
        assert!(is_hallucinated_phase_tool_call("set_phase", &json!({})));
        assert!(is_hallucinated_phase_tool_call("phase_transition", &json!({})));
        assert!(is_hallucinated_phase_tool_call("done", &json!({ "done": "" })));
        assert!(is_hallucinated_phase_tool_call("reading", &json!({})));
    }

    #[test]
    fn parse_hallucinated_phase_from_reading_tool_name() {
        use crate::event::Phase;
        assert_eq!(
            parse_hallucinated_phase_from_tool_call("reading", &json!({})),
            Some(Phase::Reading)
        );
        assert_eq!(
            parse_hallucinated_phase_from_tool_call("phase:", &json!({ "done": "" })),
            Some(Phase::Done)
        );
    }

    #[test]
    fn architect_todo_write_has_no_item_cap() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        assert_eq!(spec.max_todo_items(), None);
        let todos: Vec<_> = (1..=20)
            .map(|i| json!({"id": i.to_string(), "content": "x", "status": "pending"}))
            .collect();
        let msg = tool_pre_gate_block(
            &spec,
            "todo_write",
            &json!({ "todos": todos }),
            false,
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_none());
    }

    #[test]
    fn discussion_reply_only_blocks_tools() {
        let spec = RunSpec::for_architect_discussion_with_reads(false);
        let msg = tool_pre_gate_block(
            &spec,
            "file_read",
            &json!({ "path": "README.md" }),
            false,
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_some());
        assert!(msg.unwrap().contains("reply-only"));
    }

    #[test]
    fn discussion_with_reads_allows_file_read_pre_gate() {
        let spec = RunSpec::for_architect_discussion_with_reads(true);
        let msg = tool_pre_gate_block(
            &spec,
            "file_read",
            &json!({ "path": "README.md" }),
            false,
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_none());
    }

    #[test]
    fn done_gate_blocks_edit_close_without_mutation() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        assert!(done_gate_missing_mutation_when_expected(
            &spec,
            true,
            0,
            "[phase: answering]\nPlan only.\n[phase: done]"
        )
        .is_some());
        assert!(done_gate_missing_mutation_when_expected(&spec, true, 1, "done").is_none());
        assert!(done_gate_missing_mutation_when_expected(&spec, false, 0, "done").is_none());
        assert!(done_gate_missing_mutation_when_expected(
            &spec,
            true,
            0,
            "The repo already matches — no file change needed."
        )
        .is_some());
    }

    #[test]
    fn todo_write_flat_item_passes_pre_gate_shape() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let msg = tool_pre_gate_block(
            &spec,
            "todo_write",
            &json!({ "id": "t3", "content": "README bilingue", "status": "completed" }),
            false,
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_none(), "flat item must pass shape guard: {msg:?}");
    }

    #[test]
    fn todo_write_bare_array_passes_pre_gate_shape() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let msg = tool_pre_gate_block(
            &spec,
            "todo_write",
            &json!([
                { "id": "t1", "content": "A", "status": "completed" },
                { "id": "t3", "content": "README", "status": "completed" },
            ]),
            false,
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_none(), "bare array must pass shape guard: {msg:?}");
    }

    #[test]
    fn internal_plan_required_blocks_reads_until_plan_exists() {
        use crate::agent::state::internal_plan::ingest_internal_plan;
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let mut st = ArchitectRunState::new();
        let msg = tool_pre_gate_block(
            &spec,
            "file_read",
            &json!({ "path": "README.md" }),
            false,
            Some(&st),
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_some());
        assert!(msg.unwrap().contains("internal_plan_write"));
        let _ = ingest_internal_plan(
            &mut st.internal_plan,
            json!({"steps":[{"id":"s1","action":"read","status":"pending"}]}),
        );
        let mut tuning = EngineTuning::default();
        tuning.run_rail_enabled = false;
        let msg = tool_pre_gate_block(
            &spec,
            "file_read",
            &json!({ "path": "README.md" }),
            false,
            Some(&st),
            None,
            None,
            &tuning,
        );
        assert!(msg.is_none());
    }

    #[test]
    fn bash_heredoc_precheck_on_windows() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let msg = tool_pre_gate_block(
            &spec,
            "bash",
            &json!({ "command": "cat << 'EOF' > README.md" }),
            false,
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        if cfg!(windows) {
            assert!(msg.is_some());
            assert!(msg.unwrap().contains("heredoc"));
        } else {
            assert!(msg.is_none());
        }
    }

    #[test]
    fn verify_gate_blocks_when_mutations_and_verify_not_passed() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        assert!(done_gate_verify_not_passed(&spec, true, 2, true, false).is_some());
        assert!(done_gate_verify_not_passed(&spec, true, 2, true, true).is_none());
        assert!(done_gate_verify_not_passed(&spec, false, 2, true, false).is_none());
    }

    #[test]
    fn todo_shape_fail_includes_payload_preview() {
        let msg = todo_payload_shape_guard(&json!({ "oops": "x".repeat(400) }))
            .expect("shape fail");
        assert!(msg.contains("Received payload"));
    }

    #[test]
    fn hallucinated_phase_tool_ignores_real_tools() {
        assert!(!is_hallucinated_phase_tool_call(
            "file_read",
            &json!({ "path": "x" })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "glob",
            &json!({ "pattern": "**/*" })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "todo_write",
            &json!({ "todos": [] })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "bash",
            &json!({ "command": "ls" })
        ));
    }
}
