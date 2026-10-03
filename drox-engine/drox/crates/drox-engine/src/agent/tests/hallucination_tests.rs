//! Tests des tool_calls de phase hallucinés (GLM/Qwen).

use super::*;

#[test]
fn hallucinated_phase_tool_detects_common_variants() {
    assert!(is_hallucinated_phase_tool_call("phase", &json!({ "done": "" })));
    assert!(is_hallucinated_phase_tool_call("Phase:", &json!({ "done": "" })));
    assert!(is_hallucinated_phase_tool_call("phase:done", &json!({})));
    assert!(is_hallucinated_phase_tool_call("set_phase", &json!({})));
    assert!(is_hallucinated_phase_tool_call("phase_transition", &json!({})));
    assert!(is_hallucinated_phase_tool_call("done", &json!({ "done": "" })));
    // Smoke Qwen3.6 : marqueur avec crochets + junk XML → sinon `unknown tool:` en boucle.
    assert!(is_hallucinated_phase_tool_call(
        "[phase: testing]\n</parameter",
        &json!({})
    ));
    assert!(is_hallucinated_phase_tool_call("[phase: done]", &json!({})));
    assert!(is_hallucinated_phase_tool_call("[phase: answering]", &json!({})));
}

#[test]
fn hallucinated_phase_tool_ignores_real_tools() {
    assert!(!is_hallucinated_phase_tool_call(
        "file_read",
        &json!({ "path": "x" })
    ));
    assert!(!is_hallucinated_phase_tool_call(
        "todo_write",
        &json!({ "todos": [] })
    ));
    assert!(!is_hallucinated_phase_tool_call(
        "bash",
        &json!({ "command": "echo" })
    ));
    assert!(!is_hallucinated_phase_tool_call(
        "done",
        &json!({ "path": "x", "done": true })
    ));
}

#[tokio::test]
async fn hallucinated_phase_tool_skips_permission_ask_and_surfaces_engine_hint() {
    use drox_permissions::{
        PermissionBehavior, PermissionEngine, PermissionMode, Rule, RuleSet, RuleSource,
        RuleValue,
    };

    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Plan minimal."),
        answering_turn_with_hallucinated_phase_tool(),
        done_turn("OK."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);

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
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("test")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let has_phase_hint = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                is_error: true,
                output,
                ..
            } if output
                .get("error")
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.contains("phase markers are NOT tools"))
        )
    });
    assert!(
        has_phase_hint,
        "attendu message moteur explicite (pas refus permission) ; events={events:?}"
    );
    let any_user_denied = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                is_error: true,
                output,
                ..
            } if output
                .get("error")
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.contains("User denied permission"))
        )
    });
    assert!(
        !any_user_denied,
        "le faux outil phase ne doit pas passer par Ask → refus ; events={events:?}"
    );
}
