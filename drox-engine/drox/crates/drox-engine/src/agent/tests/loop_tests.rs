//! Tests du détecteur de boucle, des nudges et des tours silencieux.

use super::*;

/// 1.5.14 L1 — repro prod : plan 1/2, le modèle répète `[phase: done]`
/// sans `todo_write` de clôture. Avant le fix, le 3e tour identique
/// abortait avec `LoopDetected` ; après, les gates D4 nudgent jusqu'à
/// convergence.
#[tokio::test]
async fn loop_does_not_abort_when_done_blocked_by_open_todo_repeated() {
    let tid_plan = ToolUseId::new();
    let tid_close = ToolUseId::new();
    let premature_done = || {
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nCorrectif livré, je clôture.\n[phase: done]"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ]
    };
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : plan 2 items — 1 completed, 1 in_progress (widget 1/2).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe pose le plan.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_plan,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "1", "content": "Redirect /docs", "status": "completed" },
                        { "id": "2", "content": "Bouton retour accueil", "status": "in_progress" },
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        premature_done(),
        premature_done(),
        premature_done(),
        // Tour 5 : clôture plan puis done.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: verifying]\nJe coche le dernier item.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_close,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "1", "content": "Redirect /docs", "status": "completed" },
                        { "id": "2", "content": "Bouton retour accueil", "status": "completed" },
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nTerminé.\n[phase: done]".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let raw: Vec<_> = agent.run("docs").collect::<Vec<_>>().await;
    assert!(
        !raw
            .iter()
            .any(|r| matches!(r, Err(EngineError::LoopDetected { .. }))),
        "repeated premature done with open todo must not abort; got {raw:?}",
    );
    assert!(
        matches!(raw.last(), Some(Ok(AgentEvent::Stop { .. }))),
        "expected clean Stop after todo close; got {raw:?}",
    );
}

#[tokio::test]
async fn silent_turn_triggers_one_nudge_then_done() {
    // Tour 1 : lecture / prose sans outil → nudge générique.
    // Tour 2 : todo obligatoire.
    // Tour 3 : answering + done.
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nok, je commence.\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        read_then_one_todo_turn("Je pose la liste."),
        done_turn("voici la réponse"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let events: Vec<_> = agent
        .run("salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    // On doit voir au moins le texte du tour 1 ET le marqueur Done du tour 3.
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("je commence")))
    );
    assert!(events.iter().any(
        |e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)
    ));
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn nudge_loops_until_max_iterations_when_done_never_emitted() {
    // Sprint A.2 : la seule règle de fin propre est `[phase: done]`. Si
    // le modèle ne le signale jamais, on relance jusqu'à atteindre
    // `max_iterations` (garde-fou unique). Le test borne explicitement
    // `max_iterations: 3` pour rester rapide, et fournit assez de tours
    // muets pour couvrir cette borne sans paniquer (`ScriptedLlm` panic
    // si on dépasse).
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\ntour 1 muet\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\ntour 2 muet\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\ntour 3 muet\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
    ]));
    let registry = Arc::new(ToolRegistry::new());
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let cfg = AgentConfig {
        max_iterations: 3,
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let raw: Vec<_> = agent.run("salut").collect::<Vec<_>>().await;
    let events: Vec<&AgentEvent> = raw.iter().filter_map(|r| r.as_ref().ok()).collect();

    // Les 3 tours ont été consommés (donc on a bien relancé à chaque
    // fois). Aucun `Done` n'a été émis, et la dernière entrée du stream
    // est l'erreur `MaxIterations(3)`.
    assert_eq!(
        events
            .iter()
            .filter(
                |e| matches!(e, AgentEvent::TextDelta { text } if text.contains("muet"))
            )
            .count(),
        3,
        "les 3 tours muets doivent tous avoir été consommés"
    );
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)),
        "aucun `[phase: done]` n'a été émis, donc aucun PhaseEnter Done"
    );
    assert!(
        matches!(raw.last(), Some(Err(EngineError::MaxIterations(3)))),
        "le stream doit se terminer par MaxIterations(3), got {:?}",
        raw.last()
    );
}

/// Sprint Hotfix « boucle édition/lecture » — empreinte de texte assistant
/// répétée à l'identique. Attendu avec seuil assoupli :
/// 1er tour `Ok` → …
/// 2e tour `Warn` (strike 1) → nudge anti-boucle.
/// 3e tour `Warn` (strike 2) → nudge anti-boucle.
/// 4e tour `Abort` → `EngineError::LoopDetected`.
#[tokio::test]
async fn repeated_assistant_text_triggers_loop_detected_after_nudge() {
    let same_turn = || {
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nje cherche…\n\
                       [phase: answering]\nVoici ce que je trouve.\n"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ]
    };
    let llm = Arc::new(ScriptedLlm::new(vec![
        same_turn(),
        same_turn(),
        same_turn(),
        same_turn(),
    ]));
    let registry = Arc::new(ToolRegistry::new());
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    // `max_iterations` largement supérieur pour s'assurer que c'est
    // bien le `LoopDetector` qui clôt le run, pas le garde-fou.
    let cfg = AgentConfig {
        max_iterations: 12,
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let raw: Vec<_> = agent.run("explique").collect::<Vec<_>>().await;
    match raw.last() {
        Some(Err(EngineError::LoopDetected { kind, turns })) => {
            // Sans tool_calls dans les tours, les empreintes texte ET
            // tool_calls (= vide) coïncident toutes les deux → kind est
            // « both ». L'important est que la détection ait lieu.
            assert!(
                *kind == "both" || *kind == "text",
                "kind doit refléter une répétition de texte, got {kind:?}"
            );
            assert!(*turns >= 2, "au moins deux strikes consécutifs : got {turns}");
        }
        other => panic!("expected LoopDetected, got {other:?}"),
    }
}

/// Sprint Hotfix « boucle » — variation : le 2e tour est **différent** du
/// 1er (donc on reset le compteur), et seuls les tours 2-3-4 sont
/// identiques. Doit aussi déclencher `LoopDetected` (sur les tours 2-3
/// puis abort au 4).
#[tokio::test]
async fn loop_detector_resets_when_intermediate_turn_differs() {
    let same_turn = || {
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\npar ici\n\
                       [phase: answering]\nrésultat identique\n"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ]
    };
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nje commence\n\
                       [phase: answering]\nréponse #1\n"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        same_turn(),
        same_turn(),
        same_turn(),
        same_turn(),
    ]));
    let registry = Arc::new(ToolRegistry::new());
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let cfg = AgentConfig {
        max_iterations: 12,
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let raw: Vec<_> = agent.run("essaie").collect::<Vec<_>>().await;
    assert!(
        matches!(raw.last(), Some(Err(EngineError::LoopDetected { .. }))),
        "expected LoopDetected after 4 identical tail turns, got {:?}",
        raw.last()
    );
}

#[test]
fn loop_detector_treats_different_thinking_as_progress() {
    let mut det = LoopDetector::new();
    let mk = |thinking: &str| TurnOutcome {
        text: String::new(),
        thinking: thinking.into(),
        tool_calls: vec![PendingToolCall {
            id: ToolUseId::new(),
            name: "todo_write".into(),
            arguments: serde_json::json!({}),
        }],
        reason: StopReason::EndTurn,
        usage: Usage::default(),
        final_phase: Some(Phase::Acting),
        saw_answering: false,
        saw_analyzing: false,
        saw_testing: false,
    };
    assert_eq!(det.observe(&mk("plan A")), LoopDecision::Ok);
    assert_eq!(det.observe(&mk("plan B — fix JSON")), LoopDecision::Ok);
    assert_eq!(det.observe(&mk("plan B — fix JSON")), LoopDecision::Warn { kind: "both" });
}

#[test]
fn loop_detector_flags_bash_family_despite_thinking_change() {
    let mut det = LoopDetector::new();
    let mk = |thinking: &str, command: &str| TurnOutcome {
        text: String::new(),
        thinking: thinking.into(),
        tool_calls: vec![PendingToolCall {
            id: ToolUseId::new(),
            name: "bash".into(),
            arguments: serde_json::json!({ "command": command }),
        }],
        reason: StopReason::EndTurn,
        usage: Usage::default(),
        final_phase: Some(Phase::Reading),
        saw_answering: false,
        saw_analyzing: false,
        saw_testing: false,
    };
    assert_eq!(
        det.observe(&mk("try metrics", r#"cd src\app && findstr /n "metrics" page.tsx"#)),
        LoopDecision::Ok
    );
    assert_eq!(
        det.observe(&mk(
            "retry capital M",
            r#"cd src\app && findstr /n "Metrics" page.tsx"#
        )),
        LoopDecision::Warn { kind: "tool_family" }
    );
    assert_eq!(
        det.observe(&mk(
            "retry again",
            r#"cd src\app && findstr /n "Metrics" page.tsx & findstr /n "Metrics" page.tsx"#
        )),
        LoopDecision::Warn { kind: "tool_family" }
    );
    assert!(matches!(
        det.observe(&mk("still", r#"cd src\app && findstr /n "metrics" page.tsx"#)),
        LoopDecision::Abort {
            kind: "tool_family",
            ..
        }
    ));
}

#[test]
fn normalize_bash_command_folds_case_and_duplicates() {
    let a = normalize_bash_command_for_loop(r#"cd src\app && findstr /n "metrics" page.tsx"#);
    let b = normalize_bash_command_for_loop(r#"cd src\app && findstr /n "Metrics" page.tsx"#);
    let c = normalize_bash_command_for_loop(
        r#"cd src\app && findstr /n "Metrics" page.tsx & findstr /n "Metrics" page.tsx"#,
    );
    assert_eq!(a, b);
    assert_eq!(a, c);
}

/// Sprint Hotfix « boucle » — anti-faux-positif : le détecteur ne doit
/// PAS pénaliser un run normal qui converge en quelques tours différents.
/// Le run minimal `reasoning + todo (1 completed) + answering + done`
/// passe sans déclencher `LoopDetected`.
#[tokio::test]
async fn loop_detector_does_not_flag_legitimate_short_run() {
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("ok"),
        done_turn("OK."),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let events: Vec<_> = agent.run("hi").collect::<Vec<_>>().await;
    assert!(
        !matches!(events.last(), Some(Err(EngineError::LoopDetected { .. }))),
        "un run normal ne doit pas se faire flagger comme boucle"
    );
    assert!(events.iter().any(|e| matches!(e, Ok(AgentEvent::Stop { .. }))));
}

#[test]
fn mutation_intent_detector_fr_en() {
    assert!(assistant_text_suggests_mutation_intent(
        "Je vais écrire le fichier Engine enrichi maintenant."
    ));
    assert!(assistant_text_suggests_mutation_intent(
        "I will write the file with file_write right away."
    ));
    assert!(assistant_text_suggests_mutation_intent(
        "Je suis bloqué… j'appelle file_write."
    ));
    assert!(!assistant_text_suggests_mutation_intent(
        "Je vais lire le README pour comprendre l'architecture."
    ));
    assert!(!assistant_text_suggests_mutation_intent(
        "I will read the source before deciding."
    ));
}

/// FX-B 1.5.16 : prose « je vais écrire » sans tool → nudges dédiés puis abort.
#[tokio::test]
async fn intent_only_write_prose_aborts_after_nudges() {
    let loop_text = "[phase: acting]\nJe vais écrire le fichier src/app/docs/engine/page.tsx maintenant.\n";
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: loop_text.into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: loop_text.into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: loop_text.into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let mut config = AgentConfig::default();
    config.max_iterations = 8;
    let agent = Agent::new(llm, registry, ctx, config);

    let raw: Vec<_> = agent.run("Écris la page Engine").collect::<Vec<_>>().await;
    match raw.last() {
        Some(Err(EngineError::LoopDetected { kind, turns })) => {
            assert_eq!(*kind, "intent_only_write");
            assert!(*turns >= 3, "turns={turns}");
        }
        other => panic!("expected LoopDetected intent_only_write, got {other:?}"),
    }
}

#[tokio::test]
async fn silent_turn_after_tool_call_still_nudges_to_done() {
    // Après todo obligatoire : tours muets avec reasoning, puis echo,
    // puis encore muet, puis done.
    let tid_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Démarrage."),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nréflexion sans action\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJ'appelle echo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
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
                text: "[phase: reading]\nencore une réflexion sans action\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        done_turn("résultat final"),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(EchoTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let events: Vec<_> = agent
        .run("test")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert_eq!(
        events
            .iter()
            .filter(|e| {
                matches!(e, AgentEvent::ToolStart { name, .. } if name == "echo")
            })
            .count(),
        1
    );
    assert!(events.iter().any(
        |e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)
    ));
}
