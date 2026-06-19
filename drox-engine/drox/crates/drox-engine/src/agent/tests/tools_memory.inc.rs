
/// Run terminÃƒÂ© par `[phase: done]` sans compaction live Ã¢â€ â€™ pas d'archive auto.
#[tokio::test]
async fn session_not_persisted_at_done_without_live_compaction() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    // Scripts : (1) todo_write, (2) done sans mutation (gate B-MOTOR-04),
    // (3) clôture honnête sans patch, (4) compaction live.
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_plan_complete_turn("On va faire X."),
        done_turn("Voici le rÃƒÂ©sultat."),
        done_turn("Le code est dÃƒÂ©jÃƒÂ  conforme â€” aucune modification nÃƒÂ©cessaire."),
        compaction_turn("Refactorer le module X", &["src/x.rs", "src/y.rs"]),
    ]));

    let mut registry = ToolRegistry::new();    let registry = Arc::new(registry);
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

    assert!(
        !events
            .iter()
            .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
        "done seul ne doit pas archiver ; events={events:?}"
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

/// ClÃƒÂ´ture du plan todo : pas d'archive automatique (uniquement compaction live).
#[tokio::test]
async fn memory_not_persisted_when_todo_plan_closes_before_done() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    let close_tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_plan_turn_with_status("Ouverture plan", "in_progress"),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\nClÃƒÂ´ture.\n".into(),
            },
            StreamEvent::ToolCall {
                id: close_tid,
                name: "internal_plan_write".into(),
                arguments: json!({
                    "steps": [{
                        "id": "1",
                        "action": "Ãƒâ€°tape de test",
                        "status": "completed"
                    }]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        compaction_turn("Jalon : plan fermÃƒÂ©", &["src/a.rs"]),
        done_turn("RÃƒÂ©ponse finale."),
        compaction_turn("Run terminÃƒÂ©", &["src/b.rs"]),
    ]));

    let mut registry = ToolRegistry::new();    let registry = Arc::new(registry);
    let ctx = ToolContext::new(ws.clone(), false);
    let cfg = AgentConfig {
        memory: Some(memory_runtime_for_test(&ws, llm.clone())),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("TÃƒÂ¢che avec plan")
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
        n_mem, 0,
        "jalon todo + done ne doivent pas archiver ; events={events:?}"
    );
}

/// Le modÃƒÂ¨le ne doit pas pouvoir exÃƒÂ©cuter `session_end` (rÃƒÂ©servÃƒÂ©
/// `/session_end` utilisateur) mÃƒÂªme si le tool est dans le registre.
#[tokio::test]
async fn session_end_tool_call_from_model_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
    let tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
        done_turn("Je continue sans clÃƒÂ´turer la session."),
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
        "session_end doit ÃƒÂ©chouer cÃƒÂ´tÃƒÂ© moteur ; events={events:?}"
    );
}

/// Run trivial (juste answering + done, aucun outil appelÃƒÂ©) Ã¢â€ â€™ **pas**
/// de persistance, pas d'ÃƒÂ©vÃƒÂ©nement `MemoryPersisted`, et le dossier
/// `.drox/memory/sessions/` peut rester vide.
#[tokio::test]
async fn trivial_run_does_not_persist_session() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    // Un seul tour : answering + done, sans tool. Pas de script de
    // compaction nÃƒÂ©cessaire Ã¢â‚¬â€ il ne sera pas appelÃƒÂ©.
    let llm = Arc::new(ScriptedLlm::new_architect(vec![done_turn("Salut !")]));

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

/// Tracker ÃƒÂ©ligibilitÃƒÂ© : un `session_note` ÃƒÂ©pinglÃƒÂ© suffit ÃƒÂ  rendre le
/// run non trivial mÃƒÂªme sans aucun tool mutateur (cas Ã‚Â« conversation
/// utile mais sans modification de code Ã‚Â»).
#[tokio::test]
async fn pinned_session_note_alone_does_not_persist_without_live_compaction() {
    use drox_tools::SessionNoteTool;

    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    // Tour 1 : reasoning + session_note (note seule, pas de todo, pas
    // de mutation). Tour 2 : answering + done. Tour 3 : compaction.
    let note_tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe pose une note.\n".into(),
            },
            StreamEvent::ToolCall {
                id: note_tid,
                name: "session_note".into(),
                arguments: json!({ "action": "HypothÃƒÂ¨se: revoir la stratÃƒÂ©gie de cache" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK notÃƒÂ©."),
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
        !events
            .iter()
            .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
        "session_note seul + done sans compaction live ne doit pas archiver; events={events:?}"
    );
}

/// M2 Ã¢â‚¬â€ compaction proactive : au premier tour, si le budget dÃƒÂ©passe le
/// seuil `autocompact`, le moteur appelle `summarize_run` puis rÃƒÂ©ÃƒÂ©crit
/// l'historique et ÃƒÂ©met `ContextCompacted` avant le tour LLM principal.
#[tokio::test]
async fn live_compaction_emits_context_compacted_when_over_budget() {
    let dir = tempfile::tempdir().unwrap();
    let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

    let history: Vec<Message> = (0..14)
        .map(|_| Message::user("z".repeat(10_000)))
        .collect();

    let llm = Arc::new(ScriptedLlm::new(vec![
        compaction_turn("RÃƒÂ©sumÃƒÂ© intermÃƒÂ©diaire", &["src/a.rs"]),
        internal_plan_turn(),
        done_turn("TerminÃƒÂ©."),
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
            c.summary_text.contains("RÃƒÂ©sumÃƒÂ© intermÃƒÂ©diaire")
                && c.transcript_session_id == "ses_test_compact"
                && c.compaction_seq == 1
        }),
        "expected populated context_chunk_summary; compact={compact:?}"
    );
    let sessions_dir = ws.join(".drox/memory/sessions");
    let session_files: Vec<_> = std::fs::read_dir(sessions_dir.as_std_path())
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert_eq!(session_files.len(), 1, "one session .md expected");
    let body = std::fs::read_to_string(session_files[0].path()).unwrap();
    assert!(
        body.contains("RÃƒÂ©sumÃƒÂ© intermÃƒÂ©diaire") && body.contains("src/a.rs"),
        "persisted session must reuse live compaction body, got:\n{body}"
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
    let compact_idx = events
        .iter()
        .position(|e| matches!(e, AgentEvent::ContextCompacted { .. }))
        .expect("ContextCompacted expected");
    let mem_idx = events
        .iter()
        .position(|e| matches!(e, AgentEvent::MemoryPersisted { .. }))
        .expect("MemoryPersisted expected after live compaction");
    assert!(
        mem_idx > compact_idx,
        "archive aprÃƒÂ¨s compaction live ; events={events:?}"
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}
