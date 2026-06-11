//! Run rail — intégration boucle agent avec `run_rail_enabled`.

use std::sync::Arc;

use super::support::*;
use crate::agent::*;
use crate::agent::rail::{filter_tool_specs_for_station, run_rail_active, RunStation};
use drox_llm::ToolSpec;
use crate::event::AgentEvent;
use crate::run_spec::RoleId;
use drox_tools::{TodoWriteTool, ToolContext, ToolRegistry};
use futures::StreamExt;

#[test]
fn run_rail_active_on_normal_preset_only() {
    let normal = crate::EngineTuning::default();
    assert!(run_rail_active(&normal, RoleId::Architect));
    assert!(!run_rail_active(&normal, RoleId::ArchitectDiscussion));

    let relaxed = crate::orchestration::tuning::resolve_engine_tuning(Some("relaxed"), None);
    assert!(!run_rail_active(&relaxed, RoleId::Architect));
}

#[test]
fn act_station_tool_specs_hide_skill_list() {
    let specs = vec![
        ToolSpec {
            name: "file_edit".into(),
            description: String::new(),
            parameters: serde_json::json!({}),
        },
        ToolSpec {
            name: "skill_list".into(),
            description: String::new(),
            parameters: serde_json::json!({}),
        },
    ];
    let filtered = filter_tool_specs_for_station(specs, RunStation::Act);
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].name, "file_edit");
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
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("rail on"),
        done_turn("OK."),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config_with_rail());

    let events: Vec<_> = agent.run("hi").collect::<Vec<_>>().await;
    assert!(events.iter().any(|e| matches!(e, Ok(AgentEvent::Stop { .. }))));
}
