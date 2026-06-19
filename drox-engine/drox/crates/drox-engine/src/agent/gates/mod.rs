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
pub(crate) use bash_windows::{verify_bash_failure_hint, VERIFY_WINDOWS_SHELL_REMINDER};

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
    fn discussion_reply_only_blocks_tools() {
        let spec = RunSpec::for_architect_discussion_with_reads(false);
        let msg = tool_pre_gate_block(
            &spec,
            "file_read",
            &json!({ "path": "README.md" }),
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
            None,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_none());
    }

    #[test]
    fn file_read_allowed_without_internal_plan() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let st = ArchitectRunState::new();
        let msg = tool_pre_gate_block(
            &spec,
            "file_read",
            &json!({ "path": "README.md" }),
            Some(&st),
            None,
            None,
            &EngineTuning::default(),
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
    fn verify_gate_blocks_only_when_gate_enabled() {
        use crate::agent::rail::VerifyOutcome;
        use crate::orchestration::EngineTuning;

        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        assert!(done_gate_verify_not_passed(&spec, 2, &VerifyOutcome::Unknown).is_none());

        let mut tuning = EngineTuning::product_default();
        tuning.gate_done_requires_verify = true;
        let strict =
            RunSpec::for_orchestration_role_with_tuning(crate::run_spec::RoleId::Architect, &tuning);
        assert!(done_gate_verify_not_passed(&strict, 2, &VerifyOutcome::Unknown).is_some());
        assert!(done_gate_verify_not_passed(
            &strict,
            2,
            &VerifyOutcome::Fail("bash".into())
        )
        .is_some());
        assert!(done_gate_verify_not_passed(&strict, 2, &VerifyOutcome::Pass).is_none());
        assert!(done_gate_verify_not_passed(
            &strict,
            2,
            &VerifyOutcome::Waived("no scripts".into())
        )
        .is_none());
        assert!(done_gate_verify_not_passed(&strict, 0, &VerifyOutcome::Unknown).is_none());
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
            "internal_plan_write",
            &json!({ "steps": [] })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "bash",
            &json!({ "command": "ls" })
        ));
    }
}
