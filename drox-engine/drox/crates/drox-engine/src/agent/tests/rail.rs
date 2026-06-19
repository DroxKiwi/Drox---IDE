//! Run rail - integration boucle agent avec run_rail_enabled.

use std::sync::Arc;

use super::support::*;
use crate::agent::*;
use crate::agent::rail::{is_mutation_tool, run_rail_active};
use crate::event::AgentEvent;
use crate::run_spec::RoleId;
use drox_tools::{ToolContext, ToolRegistry};
use futures::StreamExt;

#[test]
fn run_rail_active_on_normal_preset_only() {
    let normal = crate::EngineTuning::default();
    assert!(run_rail_active(&normal, RoleId::Architect));
    assert!(!run_rail_active(&normal, RoleId::ArchitectDiscussion));

    let relaxed = crate::EngineTuning::from_preset(crate::orchestration::StrictnessPreset::Relaxed);
    assert!(!run_rail_active(&relaxed, RoleId::Architect));
}

#[test]
fn mutation_tool_classification() {
    assert!(is_mutation_tool("file_edit"));
    assert!(!is_mutation_tool("file_read"));
    assert!(!is_mutation_tool("skill_list"));
}

#[test]
fn architect_state_carries_rail_conductor() {
    let tuning = crate::EngineTuning::default();
    let state = crate::agent::state::ArchitectRunState::with_engine_tuning(&tuning);
    assert!(run_rail_active(&tuning, RoleId::Architect));
    assert_eq!(state.rail.act_idle_turns, 0);
}

#[tokio::test]
async fn architect_run_with_rail_completes() {
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_plan_complete_turn("rail on"),
        done_turn("OK."),
    ]));
    let registry = Arc::new(ToolRegistry::new());
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config_with_rail());

    let events: Vec<_> = agent.run("hi").collect::<Vec<_>>().await;
    assert!(events.iter().any(|e| matches!(e, Ok(AgentEvent::Stop { .. }))));
}
