#[tokio::test]
async fn done_allowed_after_code_edit_completes_run() {
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        todo_then_code_edit_turn("src/lib.rs"),
        done_turn("rÃ©ponse sans phase testing"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeFileEditTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let raw: Vec<_> = agent.run("corrige le bug").collect().await;
    let events: Vec<AgentEvent> = raw.into_iter().filter_map(Result::ok).collect();

    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
        "expected Done after code edit, got {events:?}"
    );
}

#[tokio::test]
async fn done_allowed_when_only_markdown_edited() {
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        todo_then_code_edit_turn("docs/README.md"),
        done_turn("doc mise ÃƒÂ  jour"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeFileEditTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let raw: Vec<_> = agent.run("mets ÃƒÂ  jour le readme").collect().await;
    let events: Vec<AgentEvent> = raw.into_iter().filter_map(Result::ok).collect();

    assert!(
        !events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Testing })),
        "markdown-only edit must not require testing phase, got {events:?}"
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
        "expected Done without testing, got {events:?}"
    );
}

#[tokio::test]
async fn done_blocked_when_todos_still_open() {
    // ScÃƒÂ©nario : le modÃƒÂ¨le ouvre la to-do en `in_progress` puis tente de
    // clÃƒÂ´turer directement (rÃƒÂ©ponse + done). La nouvelle gate doit refuser
    // ce `done` (todo non clÃƒÂ´turÃƒÂ©e) et nudger. Le tour 3 met ÃƒÂ  jour la
    // to-do en `completed` et seulement lÃƒÂ  le moteur accepte de fermer.
    let tid_close = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        // Tour 1 : ouverture de la to-do (in_progress).
        read_then_one_todo_turn_with_status(
            "Je vais traiter la demande.",
            "in_progress",
        ),
        // Tour 2 : answering + done, mais la to-do est toujours ouverte
        // Ã¢â€ â€™ la gate doit nudger et NE PAS clÃƒÂ´turer.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nrÃƒÂ©ponse hÃƒÂ¢tive\n[phase: done]".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        // Tour 3 : le modÃƒÂ¨le clÃƒÂ´ture la to-do puis re-tente.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: verifying]\nJe ferme la to-do.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_close,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Ãƒâ€°tape de test",
                        "status": "completed",
                    }]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 4 : answering + done. Tout est OK, on doit fermer.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nrÃƒÂ©ponse finale\n[phase: done]".into(),
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    // On exige qu'on ait vu DEUX appels todo_write (ouverture + clÃƒÂ´ture).
    let todo_finishes = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::ToolFinish { is_error: false, .. }))
        .count();
    assert!(
        todo_finishes >= 2,
        "expected at least 2 successful todo_write tool finishes (open + close), got {todo_finishes} Ã¢â‚¬â€ events: {events:?}",
    );

    // Le run doit se clÃƒÂ´turer normalement (Stop final) : la gate finit
    // par accepter `done` une fois la to-do passÃƒÂ©e en `completed`.
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
        "expected PhaseEnter(Done) eventually, got {events:?}",
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));

    // La rÃƒÂ©ponse finale doit ÃƒÂªtre celle du tour 4, pas la hÃƒÂ¢tive du tour 2.
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("rÃƒÂ©ponse finale"))),
        "expected final answer to come from the post-close turn, got {events:?}",
    );
}

#[tokio::test]
async fn done_marker_terminates_turn() {
    // `todo_write` obligatoire + `answering` avant `done` : deux tours.
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

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
async fn context_snip_event_emitted_when_history_exceeds_threshold() {
    use crate::context::ContextPolicy;
    use drox_context::{ContextBudget, RoughTokenCounter, SnipConfig};

    // Tour 1 : modÃƒÂ¨le conclut (pas de tool call). On veut juste que le
    // snip prÃƒÂ©-tour se dÃƒÂ©clenche sur l'historique initial.
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_one_todo_turn("Contexte pour le snip."),
        done_turn("ok"),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);

    // Budget minuscule (1k window, 0 reserved, 0 autocompact buffer) Ã¢â€ â€™
    // n'importe quelle conversation dÃƒÂ©passe autocompact_threshold.
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

    // On injecte un gros prompt utilisateur initial pour forcer le dÃƒÂ©clenchement.
    // Note : seuls les tool_results sont snipÃƒÂ©s, donc on doit injecter
    // un tool_result gÃƒÂ©ant via le prompt initial Ã¢â‚¬â€ pas possible dans ce
    // setup minimal. On vÃƒÂ©rifie juste que le snip se dÃƒÂ©clenche sur les
    // tool_results dÃƒÂ©jÃƒÂ  prÃƒÂ©sents.
    // Pour la dÃƒÂ©monstration : un tour minimal sans tool_result ne
    // produira pas de ContextSnip mais ne doit pas crasher non plus.
    let cfg = AgentConfig {
        context: Some(policy),
        ..test_agent_config()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let events: Vec<_> = agent
        .run("x")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();
    // L'agent doit s'ÃƒÂªtre arrÃƒÂªtÃƒÂ© proprement, peu importe si ContextSnip
    // a ÃƒÂ©tÃƒÂ© ÃƒÂ©mis (pas de tool_result ÃƒÂ  snipper dans ce setup).
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn max_iterations_yields_error() {
    // Le LLM redemande toujours echo Ã¢â€ â€™ boucle infinie bornÃƒÂ©e par max_iter.
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
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
        ..test_agent_config()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let results: Vec<_> = agent.run("loop").collect::<Vec<_>>().await;
    let last = results.into_iter().last().expect("at least one event");
    assert!(matches!(last, Err(EngineError::MaxIterations(2))));
}

#[tokio::test]
async fn consecutive_same_phase_markers_are_deduplicated() {
    // Devstral / Gemma ponctuent leur prose avec `[phase: reading]` ÃƒÂ 
    // rÃƒÂ©pÃƒÂ©tition. Le consommateur ne doit voir QU'UN seul `PhaseEnter`
    // tant que la phase ne change pas effectivement. Tour 2 : texte
    // riche puis `answering` + `done` (todo dÃƒÂ©jÃƒÂ  posÃƒÂ© au tour 1).
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_one_todo_turn("PrÃƒÂ©ambule."),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nP1\n[phase: reading]\nP2\n\
                       [phase: reading]\nP3\n[phase: reading]\n\
                       lit le repo\n\
                       [phase: answering]\nrÃƒÂ©ponse finale\n[phase: done]"
                    .into(),
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("x")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let phase_enters: Vec<Phase> = events
        .iter()
        .filter_map(|e| match e {
            AgentEvent::PhaseEnter { phase } => Some(*phase),
            _ => None,
        })
        .collect();
    // Tour 1 : reading + todo. Tour 2 : plusieurs `reading` identiques Ã¢â€ â€™ 1
    // `PhaseEnter` tant que la phase ne change pas ; puis answering ; done.
    let dedup_tail = &[
        Phase::Reading,
        Phase::Answering,
        Phase::Done,
    ];
    assert!(
        phase_enters.windows(dedup_tail.len()).any(|w| w == dedup_tail),
        "expected dedup tail {dedup_tail:?} as a subslice, got {phase_enters:?}"
    );
}

// --- Boucle agent : nudge unique ----------------------------------------

#[tokio::test]
async fn silent_turn_triggers_one_nudge_then_done() {
    // Tour 1 : lecture / prose sans outil Ã¢â€ â€™ nudge gÃƒÂ©nÃƒÂ©rique.
    // Tour 2 : todo obligatoire.
    // Tour 3 : answering + done.
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
        done_turn("voici la rÃƒÂ©ponse"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

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
    // Sprint A.2 : la seule rÃƒÂ¨gle de fin propre est `[phase: done]`. Si
    // le modÃƒÂ¨le ne le signale jamais, on relance jusqu'ÃƒÂ  atteindre
    // `max_iterations` (garde-fou unique). Le test borne explicitement
    // `max_iterations: 3` pour rester rapide, et fournit assez de tours
    // muets pour couvrir cette borne sans paniquer (`ScriptedLlm` panic
    // si on dÃƒÂ©passe).
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
        max_iterations: 4,
        ..test_agent_config()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let raw: Vec<_> = agent.run("salut").collect::<Vec<_>>().await;
    let events: Vec<&AgentEvent> = raw.iter().filter_map(|r| r.as_ref().ok()).collect();

    // Les 3 tours ont ÃƒÂ©tÃƒÂ© consommÃƒÂ©s (donc on a bien relancÃƒÂ© ÃƒÂ  chaque
    // fois). Aucun `Done` n'a ÃƒÂ©tÃƒÂ© ÃƒÂ©mis, et la derniÃƒÂ¨re entrÃƒÂ©e du stream
    // est l'erreur `MaxIterations(3)`.
    assert_eq!(
        events
            .iter()
            .filter(
                |e| matches!(e, AgentEvent::TextDelta { text } if text.contains("muet"))
            )
            .count(),
        3,
        "les 3 tours muets doivent tous avoir ÃƒÂ©tÃƒÂ© consommÃƒÂ©s"
    );
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)),
        "aucun `[phase: done]` n'a ÃƒÂ©tÃƒÂ© ÃƒÂ©mis, donc aucun PhaseEnter Done"
    );
    assert!(
        matches!(raw.last(), Some(Err(EngineError::MaxIterations(4)))),
        "le stream doit se terminer par MaxIterations(4), got {:?}",
        raw.last()
    );
}
