#[tokio::test]
async fn short_run_completes_normally() {
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("ok"),
        done_turn("OK."),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent.run("hi").collect::<Vec<_>>().await;
    assert!(events.iter().any(|e| matches!(e, Ok(AgentEvent::Stop { .. }))));
}

#[tokio::test]
async fn answering_phase_alone_does_not_terminate_loop() {
    // Important : `[phase: answering]` ne termine pas la boucle. Seul
    // `[phase: done]` ferme. Tour 1 : reasoning + answering sans done.
    // Tour 2 : todo obligatoire. Tour 3 : conforme.
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nPuis answering sans done.\n\
                       [phase: answering]\nVoici la rÃƒÂ©ponse.\n"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        read_then_one_todo_turn("Liste minimale."),
        done_turn("Voici la rÃƒÂ©ponse (confirmÃƒÂ©e)."),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("question")
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
    assert!(phases.contains(&Phase::Answering));
    assert!(phases.contains(&Phase::Done));
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn done_without_answering_promotes_substantial_text_without_second_llm_turn() {
    // Anti-doublon UI : analyse longue dans `reading` + `done` Ã¢â€ â€™ promotion
    // `answering` cÃƒÂ´tÃƒÂ© ÃƒÂ©vÃƒÂ©nements, sans relancer le LLM.
    let long_analysis = "Voici l'analyse complÃƒÂ¨te du projet avec suffisamment \
        de dÃƒÂ©tails techniques pour dÃƒÂ©passer le seuil de promotion automatique \
        cÃƒÂ´tÃƒÂ© moteur sans second tour LLM ni rÃƒÂ©pÃƒÂ©tition visible pour l'utilisateur.";
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Analyse demandÃƒÂ©e."),
        premature_done_turn(long_analysis),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("analyse")
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
    assert!(phases.contains(&Phase::Reading));
    assert!(phases.contains(&Phase::Answering));
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn done_without_answering_still_nudges_when_text_too_short() {
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Analyse demandÃƒÂ©e."),
        premature_done_turn("OK."),
        done_turn(
            "Voici l'analyse complÃƒÂ¨te du projet avec assez de contenu pour \
             clÃƒÂ´turer proprement dans la phase answering sans ambiguÃƒÂ¯tÃƒÂ©.",
        ),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("analyse")
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
    assert!(phases.contains(&Phase::Answering));
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn opening_todo_write_without_marker_injects_reading_not_blocked() {
    let tid = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::ToolCall {
                id: tid.clone(),
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Saluer l'utilisateur",
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
            StreamEvent::TextDelta {
                text: "[phase: answering]\nSalut !\n[phase: done]".into(),
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
        .run("Salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    assert!(
        !events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { is_error: true, .. }
        )),
        "todo_write en tÃƒÂªte de tour ne doit pas ÃƒÂªtre bloquÃƒÂ© ; events={events:?}"
    );
    let idx_reading = events.iter().position(|e| {
        matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Reading)
    });
    let idx_todo = events.iter().position(|e| {
        matches!(e, AgentEvent::ToolStart { name, .. } if name == "todo_write")
    });
    assert!(
        idx_reading.is_some() && idx_todo.is_some() && idx_reading < idx_todo,
        "PhaseEnter(Reading) synthÃƒÂ©tique doit prÃƒÂ©cÃƒÂ©der ToolStart(todo_write) ; idx_reading={idx_reading:?} idx_todo={idx_todo:?} events={events:?}"
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}


/// Anti-rÃƒÂ©gression : scÃƒÂ©nario rÃƒÂ©el observÃƒÂ© sur GLM-4.7-Flash Ã¢â‚¬â€ le modÃƒÂ¨le
/// crÃƒÂ©e un plan de 3 ÃƒÂ©tapes puis enchaÃƒÂ®ne 3 outils mutateurs sans MAJ
/// intermÃ©diaire. Le filet moteur doit relancer avec un nudge standard
/// SANS bloquer le run (le tour avec les outils est acceptÃƒÂ© ; le nudge
/// influence le tour suivant). Le test vÃƒÂ©rifie surtout que la sÃƒÂ©quence
/// arrive ÃƒÂ  `Stop` propre, et que les outils mutateurs sont bien exÃƒÂ©cutÃƒÂ©s.
#[allow(clippy::too_many_lines)]
#[tokio::test]
async fn forgotten_done_after_answering_uses_minimal_nudge() {
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : reasoning + answering, mais PAS de [phase: done].
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nSalutation triviale.\n\
                       [phase: answering]\nSalut ! Je suis prÃƒÂªt ÃƒÂ  t'aider."
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : le modÃƒÂ¨le obÃƒÂ©it au nudge minimal et ÃƒÂ©met juste `done`.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: done]".into(),
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
        .run("Salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    // Le tour 2 ne doit PAS contenir de nouveau TextDelta avec Ã‚Â« Salut Ã‚Â»
    // (sinon = duplication). On vÃƒÂ©rifie que le texte Ã‚Â« Salut ! Je suis
    // prÃƒÂªt Ã‚Â» apparaÃƒÂ®t une seule fois dans tout le flux d'events.
    let salut_occurrences = events
        .iter()
        .filter(|e| {
            matches!(
                e,
                AgentEvent::TextDelta { text } if text.contains("Salut !")
            )
        })
        .count();
    assert_eq!(
        salut_occurrences, 1,
        "la rÃƒÂ©ponse ne doit apparaÃƒÂ®tre qu'UNE fois (pas de double-rÃƒÂ©daction) ; \
         events={events:?}"
    );
    assert!(
        matches!(events.last(), Some(AgentEvent::Stop { .. })),
        "le run doit finir par Stop ; events={events:?}"
    );
}

/// Anti-rÃƒÂ©gression : sur un simple Ã‚Â« Salut Ã‚Â», le moteur DOIT accepter
/// `[phase: reading] Ã¢â€ â€™ [phase: answering] Ã¢â€ â€™ [phase: done]` sans
/// `todo_write`. La gate qui exigeait `todo_write` avant `done` causait
/// une boucle infinie (le modÃƒÂ¨le rÃƒÂ©-ÃƒÂ©crivait sa salutation ÃƒÂ  chaque
/// nudge `MISSING_TODO_WRITE_PROMPT`). Voir issue conversationnelle 2026-05-13.
#[tokio::test]
async fn done_accepted_for_pure_conversation_without_todo_write() {
    let llm = Arc::new(ScriptedLlm::new(vec![vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: "[phase: reading]\nSalutation triviale.\n\
                   [phase: answering]\nSalut ! Comment puis-je t'aider ?\n\
                   [phase: done]"
                .into(),
        },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ]]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

    let events: Vec<_> = agent
        .run("Salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let todo_starts = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::ToolStart { name, .. } if name == "todo_write"))
        .count();
    assert_eq!(
        todo_starts, 0,
        "aucun todo_write ne doit ÃƒÂªtre dÃƒÂ©clenchÃƒÂ© pour une conversation triviale ; \
         events={events:?}",
    );
    let stops = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::Stop { .. }))
        .count();
    assert_eq!(
        stops, 1,
        "le moteur doit clÃƒÂ´turer en UN seul tour pour une salutation \
         (la boucle infinie vient d'une absence de Stop) ; events={events:?}",
    );
    assert!(
        matches!(events.last(), Some(AgentEvent::Stop { .. })),
        "le dernier ÃƒÂ©vÃƒÂ©nement doit ÃƒÂªtre Stop ; events={events:?}",
    );
}

#[tokio::test]
async fn silent_turn_after_tool_call_still_nudges_to_done() {
    // AprÃƒÂ¨s todo obligatoire : tours muets avec reasoning, puis echo,
    // puis encore muet, puis done.
    let tid_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("DÃƒÂ©marrage."),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nrÃƒÂ©flexion sans action\n".into(),
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
                text: "[phase: reading]\nencore une rÃƒÂ©flexion sans action\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        done_turn("rÃƒÂ©sultat final"),
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

// ---------------------------------------------------------------------
// Sprint M1 Ã¢â‚¬â€ tests d'intÃƒÂ©gration mÃƒÂ©moire de session.
// ---------------------------------------------------------------------

