use std::sync::Arc;

use super::support::*;
use crate::agent::*;
use crate::event::{AgentEvent, Phase};
use drox_tools::{ToolContext, ToolRegistry};
use drox_types::{StopReason, StreamEvent, ToolUseId, Usage};
use futures::StreamExt;
use serde_json::json;

#[tokio::test]
async fn read_only_tool_before_plan_write_is_allowed() {
    let tid_echo = ToolUseId::new();
    let tid_plan = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe regarde rapidement.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
                name: "echo".into(),
                arguments: json!({ "v": 1 }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: planning]\nMaintenant je plan.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_plan.clone(),
                name: "internal_plan_write".into(),
                arguments: test_internal_plan_payload(),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(EchoTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("test")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(events.iter().any(|e| {
        matches!(e, AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_echo)
    }));
    assert!(!events
        .iter()
        .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. })));
}

#[tokio::test]
async fn mutating_tool_without_plan_write_is_allowed() {
    let tid_bash = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe vais lancer un script.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_bash.clone(),
                name: "bash".into(),
                arguments: json!({ "command": "ls" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(FakeBashTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("test")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(events.iter().any(|e| {
        matches!(e, AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_bash)
    }));
}

#[tokio::test]
async fn hallucinated_phase_tool_skips_permission_ask_and_surfaces_engine_hint() {
    use crate::permissions::PermissionPolicy;
    use drox_permissions::{
        PermissionBehavior, PermissionEngine, PermissionMode, Rule, RuleSet, RuleSource,
        RuleValue,
    };

    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_plan_complete_turn("Plan minimal."),
        answering_turn_with_hallucinated_phase_tool(),
        done_turn("OK."),
    ]));

    let registry = Arc::new(ToolRegistry::new());

    let mut rules = RuleSet::new();
    rules.push(Rule {
        value: RuleValue::tool_wide("echo"),
        behavior: PermissionBehavior::Deny,
        source: RuleSource::CliArg,
    });
    let policy = PermissionPolicy::new(
        Arc::new(PermissionEngine::with_rules(rules)),
        PermissionMode::Default,
    );

    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let cfg = AgentConfig {
        permissions: Some(policy),
        ..test_agent_config()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("test")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                is_error: false,
                output,
                ..
            } if output.get("recovered_phase").and_then(|v| v.as_str()) == Some("done")
        )
    }));
    assert!(events
        .iter()
        .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })));
}
