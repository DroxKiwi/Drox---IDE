#[tokio::test]
async fn tool_call_without_prior_phase_synthesizes_fallback_phase() {
    // Sprint A.4 Ã¢â‚¬â€ filet de sÃƒÂ©curitÃƒÂ© : sans marqueur, le moteur synthÃƒÂ©tise
    // une phase avant `ToolStart`. `echo` n'est pas listÃƒÂ© dans `phase_for_tool`
    // comme read-only Ã¢â€ â€™ infÃƒÂ©rence **Acting** (comportement actuel du moteur).
    let tu_bad = ToolUseId::new();
    let tu_todo = ToolUseId::new();
    let tu_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::ToolCall {
                id: tu_bad.clone(),
                name: "echo".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nEcho conforme.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo,
                name: "internal_plan_write".into(),
                arguments: json!({
                    "steps": [{
                        "id": "1",
                        "action": "Echo",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::ToolCall {
                id: tu_echo.clone(),
                name: "echo".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("ok"),
    ]));
    let mut registry = ToolRegistry::new();    registry.register(Arc::new(EchoTool));
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
        !events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: true, .. } if id == &tu_bad
        )),
        "echo sans marqueur ne doit pas ÃƒÂªtre en erreur ; events={events:?}"
    );
    assert!(
        events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tu_bad
        )),
        "premier echo doit rÃƒÂ©ussir (phase synthÃƒÂ©tisÃƒÂ©e avant le tool) ; events={events:?}"
    );
    assert!(
        events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tu_echo
        )),
        "deuxiÃƒÂ¨me echo doit rÃƒÂ©ussir aprÃƒÂ¨s flux conforme ; events={events:?}"
    );
    let idx_acting = events.iter().position(|e| {
        matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Acting)
    });
    let idx_first_echo = events.iter().position(|e| {
        matches!(e, AgentEvent::ToolStart { id, name, .. } if id == &tu_bad && name == "echo")
    });
    assert!(
        idx_acting.is_some()
            && idx_first_echo.is_some()
            && idx_acting < idx_first_echo,
        "PhaseEnter(Acting) synthÃƒÂ©tique doit prÃƒÂ©cÃƒÂ©der le premier ToolStart(echo) ; idx_acting={idx_acting:?} idx_first_echo={idx_first_echo:?} events={events:?}"
    );
}

/// Qwen3-Coder et consorts : `todo_write` en tout premier ÃƒÂ©vÃƒÂ©nement du
/// tour sans marqueur de phase Ã¢â‚¬â€ le filet `phase_for_tool` injecte
/// `Reading` avant `ToolStart` ; la gate todo/mutateur ne bloque pas.
#[tokio::test]
async fn run_completes_when_model_batches_mutating_tools_then_updates_todo() {
    let tu_todo_open = ToolUseId::new();
    let tu_bash_1 = ToolUseId::new();
    let tu_bash_2 = ToolUseId::new();
    let tu_todo_close = ToolUseId::new();

    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        // Tour 1 : reasoning + plan en 2 ÃƒÂ©tapes (in_progress + pending).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe planifie en 2 ÃƒÂ©tapes.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo_open.clone(),
                name: "internal_plan_write".into(),
                arguments: json!({
                    "steps": [
                        { "id": "1", "action": "Etape 1", "status": "in_progress" },
                        { "id": "2", "action": "Etape 2", "status": "pending" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : deux `bash` ÃƒÂ  la suite sans `todo_write` intercalÃƒÂ© Ã¢â€ â€™
        // le moteur va injecter un nudge en fin de tour.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\nLes deux ÃƒÂ©tapes en backend.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu_bash_1.clone(),
                name: "bash".into(),
                arguments: json!({ "cmd": "echo step1" }),
            },
            StreamEvent::ToolCall {
                id: tu_bash_2.clone(),
                name: "bash".into(),
                arguments: json!({ "cmd": "echo step2" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 3 : le modÃƒÂ¨le reÃƒÂ§oit le nudge, ferme la todo proprement
        // puis ÃƒÂ©met answering + done.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\nJe mets ÃƒÂ  jour la todo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo_close.clone(),
                name: "internal_plan_write".into(),
                arguments: json!({
                    "steps": [
                        { "id": "1", "action": "Etape 1", "status": "completed" },
                        { "id": "2", "action": "Etape 2", "status": "completed" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 4 : answering + done.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nTerminÃƒÂ©.\n[phase: done]".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
    ]));
    let mut registry = ToolRegistry::new();    registry.register(Arc::new(FakeBashTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("fais le job")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let bash_finishes = events
        .iter()
        .filter(|e| matches!(
            e,
            AgentEvent::ToolFinish { is_error: false, .. }
        ))
        .filter(|e| {
            if let AgentEvent::ToolFinish { id, .. } = e {
                [&tu_bash_1, &tu_bash_2].contains(&id)
            } else {
                false
            }
        })
        .count();
    assert_eq!(
        bash_finishes, 2,
        "les 2 bash batched doivent quand mÃƒÂªme s'exÃƒÂ©cuter (le nudge ne bloque pas) ; events={events:?}"
    );

    let todo_finishes = events
        .iter()
        .filter(|e| matches!(
            e,
            AgentEvent::ToolFinish { is_error: false, .. }
        ))
        .filter(|e| {
            if let AgentEvent::ToolFinish { id, .. } = e {
                [&tu_todo_open, &tu_todo_close].contains(&id)
            } else {
                false
            }
        })
        .count();
    assert_eq!(
        todo_finishes, 2,
        "les 2 todo_write (ouvert + clÃƒÂ´ture) doivent rÃƒÂ©ussir ; events={events:?}"
    );

    assert!(
        matches!(events.last(), Some(AgentEvent::Stop { .. })),
        "le run doit clÃƒÂ´turer proprement aprÃƒÂ¨s le nudge ; events={events:?}"
    );
}

/// Anti-rÃƒÂ©gression du bug Ã‚Â« 2Ãƒâ€” rÃƒÂ©ponse + 1 todo Ã‚Â» observÃƒÂ© sur GLM-4.7-Flash :
/// quand le modÃƒÂ¨le a dÃƒÂ©jÃƒÂ  rÃƒÂ©digÃƒÂ© sa rÃƒÂ©ponse dans `[phase: answering]`
/// mais a omis le `[phase: done]`, le nudge envoyÃƒÂ© doit ÃƒÂªtre minimaliste
/// (Ã‚Â« ÃƒÂ©mets juste `[phase: done]` Ã‚Â») et NON le `NUDGE_PROMPT` gÃƒÂ©nÃƒÂ©rique
/// qui demande de Ã‚Â« write your final user-facing response Ã‚Â» et provoque
/// la duplication.
#[tokio::test]
async fn tool_call_after_explicit_phase_does_not_synthesize() {
    // Le modÃƒÂ¨le dÃƒÂ©clare `reading` puis `planning` avant echo : pas de
    // phase synthÃƒÂ©tisÃƒÂ©e avant le tool. `todo_write` d'abord.
    let tu_todo = ToolUseId::new();
    let tu_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nCadrage.\n[phase: planning]\nOn liste d'abord.\n"
                    .into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo,
                name: "internal_plan_write".into(),
                arguments: json!({
                    "steps": [{
                        "id": "1",
                        "action": "Echo test",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::ToolCall {
                id: tu_echo.clone(),
                name: "echo".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("ok"),
    ]));
    let mut registry = ToolRegistry::new();    registry.register(Arc::new(EchoTool));
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

    let phases: Vec<Phase> = events
        .iter()
        .filter_map(|e| match e {
            AgentEvent::PhaseEnter { phase } => Some(*phase),
            _ => None,
        })
        .collect();
    assert_eq!(
        phases.first().copied(),
        Some(Phase::Reading),
        "first explicit marker must be reading, got {phases:?}"
    );
    assert!(
        phases.contains(&Phase::Planning),
        "expected Planning phase in {phases:?}"
    );
}

#[tokio::test]
async fn synthesized_reading_for_glob_classifies_correctly() {
    // Tour 1 : glob seul (todo pas encore posÃƒÂ©e) Ã¢â‚¬â€ autorisÃƒÂ© ; phase synthÃƒÂ©tisÃƒÂ©e Reading.
    // Tour 2 : todo. Tour 3 : glob sans marqueur Ã¢â€ â€™ synthÃƒÂ¨se Reading.
    let tu1 = ToolUseId::new();
    let tu3 = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::ToolCall {
                id: tu1.clone(),
                name: "glob".into(),
                arguments: json!({ "pattern": "*" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        read_then_plan_complete_turn("Lister le repo."),
        vec![
            StreamEvent::Start,
            StreamEvent::ToolCall {
                id: tu3.clone(),
                name: "glob".into(),
                arguments: json!({ "pattern": "*" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("vu"),
    ]));
    let mut registry = ToolRegistry::new();    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("test")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let glob_phase = events
        .iter()
        .enumerate()
        .filter(|(_, e)| matches!(e, AgentEvent::ToolStart { name, .. } if name == "glob"))
        .find_map(|(i, _)| {
            (0..i).rev().find_map(|j| match &events[j] {
                AgentEvent::PhaseEnter { phase } => Some(*phase),
                _ => None,
            })
        })
        .expect("glob doit ÃƒÂªtre prÃƒÂ©cÃƒÂ©dÃƒÂ© d'un PhaseEnter");
    assert_eq!(glob_phase, Phase::Reading, "glob orphelin Ã¢â€ â€™ Reading");
}

