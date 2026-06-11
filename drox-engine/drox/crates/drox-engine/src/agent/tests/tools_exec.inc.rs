#[tokio::test]
async fn tool_call_triggers_execute_and_second_turn() {
    let tid_todo = ToolUseId::new();
    let tid_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe vais ÃƒÂ©mettre echo aprÃƒÂ¨s todo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_todo,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Ping echo",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
                name: "echo".into(),
                arguments: json!({ "msg": "ping" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : modÃƒÂ¨le signe [phase: done] et conclut.
        done_turn("fini"),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
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

    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolStart { name, .. } if name == "echo"))
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: false, .. }))
    );
    assert!(events.iter().any(
        |e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)
    ));
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("fini")))
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn unknown_tool_yields_is_error_finish() {
    let tid_todo = ToolUseId::new();
    let tid_bad = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJ'essaie un outil inconnu.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_todo,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Ãƒâ€°tape",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::ToolCall {
                id: tid_bad.clone(),
                name: "does_not_exist".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn(""),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("x")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }))
    );
}

#[tokio::test]
async fn permission_deny_skips_execution() {
    use crate::permissions::PermissionPolicy;
    use drox_permissions::{
        PermissionBehavior, PermissionEngine, PermissionMode, Rule, RuleSet, RuleSource,
        RuleValue,
    };

    let tid_todo = ToolUseId::new();
    let tid_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJ'appelle echo aprÃƒÂ¨s todo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_todo,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Echo",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
                name: "echo".into(),
                arguments: json!({ "msg": "ping" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("ok"),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(EchoTool));
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

    // Le ToolFinish doit ÃƒÂªtre marquÃƒÂ© is_error: true (refus de permission),
    // l'agent ne doit PAS avoir exÃƒÂ©cutÃƒÂ© EchoTool.
    let has_denial = events
        .iter()
        .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }));
    assert!(has_denial, "expected a denial ToolFinish in {events:?}");
}

/// Sprint Plan Ã¢â‚¬â€ anti-faux-positif : un `todo_write` qui **mette ÃƒÂ  jour**
/// la liste (mÃƒÂªmes ids, statuts changÃƒÂ©s + nouveaux ids ajoutÃƒÂ©s) doit
/// passer SANS rejet, mÃƒÂªme si la liste prÃƒÂ©cÃƒÂ©dente ÃƒÂ©tait all-completed.
#[tokio::test]
async fn todo_extension_with_kept_ids_is_allowed_even_when_previous_was_completed() {
    let tu1 = ToolUseId::new();
    let tu2 = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nPlan A.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu1.clone(),
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "1", "content": "ÃƒÂ©tape A", "status": "completed" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : reprend l'id "1" en completed + ajoute "2" en pending.
        // Ã¢â€ â€™ extension lÃƒÂ©gitime, doit passer.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nExtension.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu2.clone(),
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "1", "content": "ÃƒÂ©tape A", "status": "completed" },
                        { "id": "2", "content": "ÃƒÂ©tape B", "status": "completed" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let raw: Vec<_> = agent.run("essai").collect::<Vec<_>>().await;
    let any_blocked = raw.iter().any(|ev| match ev {
        Ok(AgentEvent::ToolFinish {
            output,
            is_error: true,
            ..
        }) => output
            .to_string()
            .contains("Blocked: you tried to **replace**"),
        _ => false,
    });
    assert!(
        !any_blocked,
        "une extension lÃƒÂ©gitime (ids communs prÃƒÂ©servÃƒÂ©s) ne doit pas ÃƒÂªtre bloquÃƒÂ©e"
    );
}
