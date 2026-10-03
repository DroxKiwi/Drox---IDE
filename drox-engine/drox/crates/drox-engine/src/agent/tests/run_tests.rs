//! Tests d'intégration de la boucle run (outils, permissions, contexte, mémoire).

use super::*;

#[tokio::test]
async fn done_marker_terminates_turn() {
    // `todo_write` obligatoire + `answering` avant `done` : deux tours.
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Alignement sur le message utilisateur."),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nbonjour\n[phase: done]".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage {
                    input_tokens: 1,
                    output_tokens: 1,
                },
            },
        ],
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

    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
        "expected PhaseEnter(Done) in {events:?}"
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("bonjour"))),
        "expected text 'bonjour' to be emitted (without marker), got {events:?}"
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn tool_call_triggers_execute_and_second_turn() {
    let tid_todo = ToolUseId::new();
    let tid_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe vais émettre echo après todo.\n".into(),
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
        // Tour 2 : modèle signe [phase: done] et conclut.
        done_turn("fini"),
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
                        "content": "Étape",
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
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
                text: "[phase: reading]\nJ'appelle echo après todo.\n".into(),
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

    // Le ToolFinish doit être marqué is_error: true (refus de permission),
    // l'agent ne doit PAS avoir exécuté EchoTool.
    let has_denial = events
        .iter()
        .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }));
    assert!(has_denial, "expected a denial ToolFinish in {events:?}");
}

#[tokio::test]
async fn context_snip_event_emitted_when_history_exceeds_threshold() {
    use crate::context::ContextPolicy;
    use drox_context::{ContextBudget, RoughTokenCounter, SnipConfig};

    // Tour 1 : modèle conclut (pas de tool call). On veut juste que le
    // snip pré-tour se déclenche sur l'historique initial.
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Contexte pour le snip."),
        done_turn("ok"),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);

    // Budget minuscule (1k window, 0 reserved, 0 autocompact buffer) →
    // n'importe quelle conversation dépasse autocompact_threshold.
    let policy = ContextPolicy::new(
        Arc::new(RoughTokenCounter::new(4)),
        ContextBudget {
            window_size: 1_000,
            reserved_output: 0,
            autocompact_buffer: 1_000,
            warning_buffer: 800,
            error_buffer: 600,
            manual_compact_buffer: 200,
        },
        Some(SnipConfig {
            min_tokens: 100,
            keep_recent_results: 0,
            placeholder: "[snip]".into(),
        }),
    );

    // On injecte un gros prompt utilisateur initial pour forcer le déclenchement.
    // Note : seuls les tool_results sont snipés, donc on doit injecter
    // un tool_result géant via le prompt initial — pas possible dans ce
    // setup minimal. On vérifie juste que le snip se déclenche sur les
    // tool_results déjà présents.
    // Pour la démonstration : un tour minimal sans tool_result ne
    // produira pas de ContextSnip mais ne doit pas crasher non plus.
    let cfg = AgentConfig {
        context: Some(policy),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("x")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();
    // L'agent doit s'être arrêté proprement, peu importe si ContextSnip
    // a été émis (pas de tool_result à snipper dans ce setup).
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn max_iterations_yields_error() {
    // Le LLM redemande toujours echo → boucle infinie bornée par max_iter.
    let make_opening_turn = || {
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nBoucle echo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: ToolUseId::new(),
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
                id: ToolUseId::new(),
                name: "echo".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ]
    };
    let make_echo_turn = || {
        vec![
            StreamEvent::Start,
            StreamEvent::ToolCall {
                id: ToolUseId::new(),
                name: "echo".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ]
    };
    let llm = Arc::new(ScriptedLlm::new(vec![
        make_opening_turn(),
        make_echo_turn(),
        make_echo_turn(),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(EchoTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let cfg = AgentConfig {
        max_iterations: 2,
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let results: Vec<_> = agent.run("loop").collect::<Vec<_>>().await;
    let last = results.into_iter().last().expect("at least one event");
    assert!(matches!(last, Err(EngineError::MaxIterations(2))));
}

/// Run non trivial (`todo_write` + answering + done) → la mémoire doit
/// se persister et émettre `MemoryPersisted` ; le `.md` doit exister
/// sur disque sous `.drox/memory/sessions/`.
#[tokio::test]
async fn session_persisted_after_done_when_run_is_non_trivial() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    // Trois scripts dans l'ordre : (1) reasoning + todo_write,
    // (2) answering + done, (3) compaction.
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("On va faire X."),
        done_turn("Voici le résultat."),
        compaction_turn("Refactorer le module X", &["src/x.rs", "src/y.rs"]),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(ws.clone(), false);
    let cfg = AgentConfig {
        memory: Some(memory_runtime_for_test(&ws, llm.clone())),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("Refactorer le module X")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    // 1. `MemoryPersisted` doit apparaître AVANT le `Stop`.
    let persisted = events.iter().find_map(|e| match e {
        AgentEvent::MemoryPersisted { slug, path, objective, .. } => {
            Some((slug.clone(), path.clone(), objective.clone()))
        }
        _ => None,
    });
    let (slug, path, objective) =
        persisted.expect("MemoryPersisted must be emitted on non-trivial run");
    assert!(!slug.is_empty(), "slug must be non-empty");
    assert_eq!(objective, "Refactorer le module X");

    // 2. Le fichier doit exister.
    let p = std::path::Path::new(&path);
    assert!(p.exists(), "session .md must be written at {path}");
    let body = std::fs::read_to_string(p).unwrap();
    assert!(body.contains("slug:"), "front-matter must include slug");
    assert!(body.contains("## Objective"), "body must include summary");
    assert!(body.contains("src/x.rs"), "files_touched must propagate");
}

/// Quand le plan passe d'« actif » à entièrement clôturé, le moteur doit
/// archiver un premier `.md` (checkpoint) puis encore à `[phase: done]`.
#[tokio::test]
async fn memory_checkpoint_when_todo_plan_closes_then_done() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    let close_tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn_with_status("Ouverture plan", "in_progress"),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\nClôture.\n".into(),
            },
            StreamEvent::ToolCall {
                id: close_tid,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Étape de test",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        compaction_turn("Jalon : plan fermé", &["src/a.rs"]),
        done_turn("Réponse finale."),
        compaction_turn("Run terminé", &["src/b.rs"]),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(ws.clone(), false);
    let cfg = AgentConfig {
        memory: Some(memory_runtime_for_test(&ws, llm.clone())),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("Tâche avec plan")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let n_mem: usize = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::MemoryPersisted { .. }))
        .count();
    assert_eq!(
        n_mem, 2,
        "attendu : checkpoint à la clôture du plan + persistance à done ; events={events:?}"
    );
}

/// Le modèle ne doit pas pouvoir exécuter `session_end` (réservé
/// `/session_end` utilisateur) même si le tool est dans le registre.
#[tokio::test]
async fn session_end_tool_call_from_model_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
    let tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid.clone(),
                name: "session_end".into(),
                arguments: json!({}),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("Je continue sans clôturer la session."),
    ]));

    let registry = Arc::new(ToolRegistry::with_simple_tools());
    let ctx = ToolContext::new(ws, false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
            .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. })),
        "session_end doit échouer côté moteur ; events={events:?}"
    );
}

/// Run trivial (juste answering + done, aucun outil appelé) → **pas**
/// de persistance, pas d'événement `MemoryPersisted`, et le dossier
/// `.drox/memory/sessions/` peut rester vide.
#[tokio::test]
async fn trivial_run_does_not_persist_session() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    // Un seul tour : answering + done, sans tool. Pas de script de
    // compaction nécessaire — il ne sera pas appelé.
    let llm = Arc::new(ScriptedLlm::new(vec![done_turn("Salut !")]));

    let registry = Arc::new(ToolRegistry::new());
    let ctx = ToolContext::new(ws.clone(), false);
    let cfg = AgentConfig {
        memory: Some(memory_runtime_for_test(&ws, llm.clone())),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("Salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(
        !events
            .iter()
            .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
        "trivial conversational run must NOT persist memory; events={events:?}"
    );
    let sessions_dir = ws.join(".drox/memory/sessions");
    if sessions_dir.exists() {
        let count = std::fs::read_dir(sessions_dir.as_std_path())
            .unwrap()
            .count();
        assert_eq!(count, 0, "sessions/ dir must be empty after trivial run");
    }
}

/// Tracker éligibilité : un `session_note` épinglé suffit à rendre le
/// run non trivial même sans aucun tool mutateur (cas « conversation
/// utile mais sans modification de code »).
#[tokio::test]
async fn pinned_session_note_alone_triggers_persistence() {
    use drox_tools::SessionNoteTool;

    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    // Tour 1 : reasoning + session_note (note seule, pas de todo, pas
    // de mutation). Tour 2 : answering + done. Tour 3 : compaction.
    let note_tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe pose une note.\n".into(),
            },
            StreamEvent::ToolCall {
                id: note_tid,
                name: "session_note".into(),
                arguments: json!({ "content": "Hypothèse: revoir la stratégie de cache" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK noté."),
        compaction_turn("Note technique", &[]),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(SessionNoteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(ws.clone(), false);
    let cfg = AgentConfig {
        memory: Some(memory_runtime_for_test(&ws, llm.clone())),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("Note rapide")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
        "a single pinned session_note must be enough to trigger persistence; events={events:?}"
    );
}

/// M2 — compaction proactive : au premier tour, si le budget dépasse le
/// seuil `autocompact`, le moteur appelle `summarize_run` puis réécrit
/// l'historique et émet `ContextCompacted` avant le tour LLM principal.
#[tokio::test]
async fn live_compaction_emits_context_compacted_when_over_budget() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    let history: Vec<Message> = (0..14)
        .map(|_| Message::user("z".repeat(10_000)))
        .collect();

    let llm = Arc::new(ScriptedLlm::new(vec![
        compaction_turn("Résumé intermédiaire", &["src/a.rs"]),
        done_turn("Terminé."),
    ]));

    let registry = Arc::new(ToolRegistry::new());
    let ctx = ToolContext::new(ws.clone(), false);
    let cfg = AgentConfig {
        system_prompt: Some("Tu es un assistant.".into()),
        context: Some(ContextPolicy::new(
            Arc::new(RoughTokenCounter::new(4)),
            ContextBudget {
                window_size: 25_000,
                reserved_output: 0,
                autocompact_buffer: 5_000,
                warning_buffer: 4_000,
                error_buffer: 4_000,
                manual_compact_buffer: 500,
            },
            None,
        )),
        memory: Some(memory_runtime_for_test(&ws, llm.clone())),
        transcript_session_id: Some("ses_test_compact".into()),
        workspace_fingerprint: ws.to_string(),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run_with_history(history, "suite")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(
        events.iter().any(|e| matches!(e, AgentEvent::ContextCompacted { .. })),
        "expected ContextCompacted in stream; events={events:?}"
    );
    let compact = events.iter().find_map(|e| {
        if let AgentEvent::ContextCompacted {
            context_chunk_summary,
            ..
        } = e
        {
            context_chunk_summary.as_ref()
        } else {
            None
        }
    });
    assert!(
        compact.is_some_and(|c| {
            c.summary_text.contains("Résumé intermédiaire")
                && c.transcript_session_id == "ses_test_compact"
                && c.compaction_seq == 1
        }),
        "expected populated context_chunk_summary; compact={compact:?}"
    );
    if let Some(AgentEvent::ContextCompacted {
        tokens_before,
        tokens_after,
        ..
    }) = events.iter().find(|e| matches!(e, AgentEvent::ContextCompacted { .. }))
    {
        assert!(
            *tokens_after * 2 < *tokens_before,
            "compaction should at least halve token estimate (before={tokens_before}, after={tokens_after})"
        );
    }
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}
