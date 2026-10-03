//! Tests des marqueurs de phase, du buffer ligne et de la synthèse de phase.

use super::*;

#[tokio::test]
async fn consume_stream_sets_saw_testing_flag() {
    let (tx, _rx) = mpsc::channel::<Result<AgentEvent, EngineError>>(8);
    let script = vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: "[phase: testing]\nrun checks\n".into(),
        },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ];
    let stream = stream::iter(script.into_iter().map(Ok::<_, LlmError>)).boxed();
    let ws = camino::Utf8Path::new(".");
    let outcome = consume_stream(stream, &tx, false, ws)
        .await
        .expect("channel open");
    assert!(outcome.saw_testing);
    assert_eq!(outcome.final_phase, Some(Phase::Testing));
}

#[test]
fn parse_phase_marker_accepts_canonical_forms() {
    assert_eq!(
        parse_phase_marker("[phase: analyzing]"),
        Some(Phase::Analyzing)
    );
    assert_eq!(
        parse_phase_marker("[phase: testing]"),
        Some(Phase::Testing)
    );
    assert_eq!(parse_phase_marker("[phase: reading]"), Some(Phase::Reading));
    assert_eq!(parse_phase_marker("[phase: clarifying]"), Some(Phase::Clarifying));
    assert_eq!(parse_phase_marker("[phase: planning]"), Some(Phase::Planning));
    assert_eq!(parse_phase_marker("[phase: acting]"), Some(Phase::Acting));
    assert_eq!(parse_phase_marker("[phase: verifying]"), Some(Phase::Verifying));
    assert_eq!(parse_phase_marker("[phase: answering]"), Some(Phase::Answering));
    assert_eq!(parse_phase_marker("[phase: done]"), Some(Phase::Done));
}

#[test]
fn parse_phase_marker_returns_none_for_legacy_removed_names() {
    for line in [
        "[phase: reasoning]",
        "[phase: next-move]",
        "[phase:reason]",
        "[phase: think]",
        "[phase: nextmove]",
        "[phase: next_move]",
    ] {
        assert_eq!(parse_phase_marker(line), None, "{line}");
    }
}

#[test]
fn legacy_removed_phase_marker_line_matches_deprecated_names() {
    assert!(legacy_removed_phase_marker_line("[phase: reasoning]"));
    assert!(legacy_removed_phase_marker_line("[phase: next-move]"));
    assert!(legacy_removed_phase_marker_line("[phase:reason]"));
}

#[test]
fn parse_phase_marker_accepts_analyzing_aliases() {
    assert_eq!(
        parse_phase_marker("[phase: analysis]"),
        Some(Phase::Analyzing)
    );
    assert_eq!(
        parse_phase_marker("[phase: survey]"),
        Some(Phase::Analyzing)
    );
}

#[test]
fn parse_phase_marker_accepts_testing_aliases() {
    assert_eq!(parse_phase_marker("[phase: test]"), Some(Phase::Testing));
    assert_eq!(parse_phase_marker("[phase: tests]"), Some(Phase::Testing));
}

#[test]
fn phase_for_tool_keeps_testing_during_verification_tools() {
    assert_eq!(
        phase_for_tool("bash", Some(Phase::Testing)),
        Phase::Testing
    );
    assert_eq!(
        phase_for_tool("file_edit", Some(Phase::Testing)),
        Phase::Acting
    );
}

#[test]
fn parse_phase_marker_accepts_answering_aliases() {
    assert_eq!(parse_phase_marker("[phase: answer]"), Some(Phase::Answering));
    assert_eq!(parse_phase_marker("[phase: reply]"), Some(Phase::Answering));
    assert_eq!(parse_phase_marker("[phase: respond]"), Some(Phase::Answering));
    assert_eq!(parse_phase_marker("[phase: response]"), Some(Phase::Answering));
}

#[test]
fn parse_phase_marker_accepts_aliases_and_casing() {
    assert_eq!(parse_phase_marker("[PHASE: Done]"), Some(Phase::Done));
    assert_eq!(parse_phase_marker("[phase: read]"), Some(Phase::Reading));
    assert_eq!(parse_phase_marker("[phase: act]"), Some(Phase::Acting));
    assert_eq!(parse_phase_marker("  [phase: done]  "), Some(Phase::Done));
}

#[test]
fn parse_phase_marker_rejects_non_markers() {
    assert_eq!(parse_phase_marker(""), None);
    assert_eq!(parse_phase_marker("hello world"), None);
    assert_eq!(parse_phase_marker("[note: done]"), None);
    assert_eq!(parse_phase_marker("phase: done"), None); // no brackets
    assert_eq!(parse_phase_marker("[phase: bogus]"), None);
    assert_eq!(parse_phase_marker("a [phase: done] b"), None); // marker not whole line
}

#[test]
fn phase_for_tool_classifies_readonly_as_reading() {
    for t in [
        "glob",
        "file_read",
        "grep",
        "lsp",
        "web_search",
        "web_fetch",
        "todo_write",
        "ask_user_question",
    ] {
        assert_eq!(
            phase_for_tool(t, None),
            Phase::Reading,
            "{t} should be Reading"
        );
    }
}

#[test]
fn phase_for_tool_keeps_analyzing_during_exploration() {
    for t in ["glob", "grep", "file_read", "workspace_map_read"] {
        assert_eq!(
            phase_for_tool(t, Some(Phase::Analyzing)),
            Phase::Analyzing,
            "{t}"
        );
    }
    assert_eq!(
        phase_for_tool("file_edit", Some(Phase::Analyzing)),
        Phase::Acting
    );
}

#[test]
fn phase_for_tool_classifies_mutative_or_unknown_as_acting() {
    for t in ["bash", "file_edit", "file_write", "notebook_edit", "delete_path", "anything_else"] {
        assert_eq!(
            phase_for_tool(t, None),
            Phase::Acting,
            "{t} should be Acting"
        );
    }
}

#[test]
fn user_prompt_suggests_workspace_analysis_heuristic() {
    assert!(user_prompt_suggests_workspace_analysis(
        "Peux-tu analyser la structure du projet ?"
    ));
    assert!(!user_prompt_suggests_workspace_analysis("fix the typo in README"));
}

#[test]
fn phase_line_buffer_strips_marker_and_emits_phase() {
    let mut buf = PhaseLineBuffer::new();
    let mut text = String::new();
    let mut phases: Vec<Phase> = Vec::new();
    buf.push_chunk(
        "Salut\n[phase: done]\nau revoir\n",
        |line| text.push_str(&line),
        |p| phases.push(p),
    );
    assert_eq!(phases, vec![Phase::Done]);
    assert_eq!(text, "Salut\nau revoir\n");
}

#[test]
fn phase_line_buffer_handles_fragmented_marker() {
    // Le marqueur arrive en plusieurs chunks (cas Ollama streaming).
    let mut buf = PhaseLineBuffer::new();
    let mut text = String::new();
    let mut phases: Vec<Phase> = Vec::new();
    for chunk in ["[phase:", " read", "ing]\n", "data"] {
        buf.push_chunk(chunk, |l| text.push_str(&l), |p| phases.push(p));
    }
    buf.finish(|l| text.push_str(&l), |p| phases.push(p));
    assert_eq!(phases, vec![Phase::Reading]);
    assert_eq!(text, "data");
}

#[test]
fn phase_line_buffer_finish_treats_trailing_marker() {
    let mut buf = PhaseLineBuffer::new();
    let mut text = String::new();
    let mut phases: Vec<Phase> = Vec::new();
    buf.push_chunk("[phase: done]", |l| text.push_str(&l), |p| phases.push(p));
    buf.finish(|l| text.push_str(&l), |p| phases.push(p));
    assert_eq!(phases, vec![Phase::Done]);
    assert!(text.is_empty(), "no text expected for pure trailing marker");
}

#[tokio::test]
async fn consecutive_same_phase_markers_are_deduplicated() {
    // Devstral / Gemma ponctuent leur prose avec `[phase: reading]` à
    // répétition. Le consommateur ne doit voir QU'UN seul `PhaseEnter`
    // tant que la phase ne change pas effectivement. Tour 2 : texte
    // riche puis `answering` + `done` (todo déjà posé au tour 1).
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Préambule."),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nP1\n[phase: reading]\nP2\n\
                       [phase: reading]\nP3\n[phase: reading]\n\
                       lit le repo\n\
                       [phase: answering]\nréponse finale\n[phase: done]"
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
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
    // Tour 1 : reading + todo. Tour 2 : plusieurs `reading` identiques → 1
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
                       [phase: answering]\nVoici la réponse.\n"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        read_then_one_todo_turn("Liste minimale."),
        done_turn("Voici la réponse (confirmée)."),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
async fn done_without_answering_triggers_re_emission_nudge() {
    // Sprint A.3 : `done` sans `answering` → refus. Todo obligatoire d'abord.
    let llm = Arc::new(ScriptedLlm::new(vec![
        read_then_one_todo_turn("Analyse demandée."),
        // Tour 2 : reading + texte + done (PAS d'answering)
        premature_done_turn("Voici l'analyse complète du projet."),
        // Tour 3 (post-nudge MISSING_ANSWERING_PROMPT) : conforme.
        done_turn("Voici l'analyse complète du projet (en answering)."),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
    assert!(
        phases.iter().filter(|p| **p == Phase::Done).count() >= 2,
        "le Done prématuré doit être ignoré comme signal d'arrêt, donc 2 Done visibles ; got {phases:?}"
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

#[tokio::test]
async fn tool_call_without_prior_phase_synthesizes_fallback_phase() {
    // Sprint A.4 — filet de sécurité : sans marqueur, le moteur synthétise
    // une phase avant `ToolStart`. `echo` n'est pas listé dans `phase_for_tool`
    // comme read-only → inférence **Acting** (comportement actuel du moteur).
    let tu_bad = ToolUseId::new();
    let tu_todo = ToolUseId::new();
    let tu_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
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
        !events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: true, .. } if id == &tu_bad
        )),
        "echo sans marqueur ne doit pas être en erreur ; events={events:?}"
    );
    assert!(
        events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tu_bad
        )),
        "premier echo doit réussir (phase synthétisée avant le tool) ; events={events:?}"
    );
    assert!(
        events.iter().any(|e| matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tu_echo
        )),
        "deuxième echo doit réussir après flux conforme ; events={events:?}"
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
        "PhaseEnter(Acting) synthétique doit précéder le premier ToolStart(echo) ; idx_acting={idx_acting:?} idx_first_echo={idx_first_echo:?} events={events:?}"
    );
}

/// Qwen3-Coder et consorts : `todo_write` en tout premier événement du
/// tour sans marqueur de phase — le filet `phase_for_tool` injecte
/// `Reading` avant `ToolStart` ; la gate todo/mutateur ne bloque pas.
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
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
        "todo_write en tête de tour ne doit pas être bloqué ; events={events:?}"
    );
    let idx_reading = events.iter().position(|e| {
        matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Reading)
    });
    let idx_todo = events.iter().position(|e| {
        matches!(e, AgentEvent::ToolStart { name, .. } if name == "todo_write")
    });
    assert!(
        idx_reading.is_some() && idx_todo.is_some() && idx_reading < idx_todo,
        "PhaseEnter(Reading) synthétique doit précéder ToolStart(todo_write) ; idx_reading={idx_reading:?} idx_todo={idx_todo:?} events={events:?}"
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
}

/// Anti-régression du bug « 2× réponse + 1 todo » observé sur GLM-4.7-Flash :
/// quand le modèle a déjà rédigé sa réponse dans `[phase: answering]`
/// mais a omis le `[phase: done]`, le nudge envoyé doit être minimaliste
/// (« émets juste `[phase: done]` ») et NON le `NUDGE_PROMPT` générique
/// qui demande de « write your final user-facing response » et provoque
/// la duplication.
#[tokio::test]
async fn forgotten_done_after_answering_uses_minimal_nudge() {
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : reasoning + answering, mais PAS de [phase: done].
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nSalutation triviale.\n\
                       [phase: answering]\nSalut ! Je suis prêt à t'aider."
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : le modèle obéit au nudge minimal et émet juste `done`.
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
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let events: Vec<_> = agent
        .run("Salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    // Le tour 2 ne doit PAS contenir de nouveau TextDelta avec « Salut »
    // (sinon = duplication). On vérifie que le texte « Salut ! Je suis
    // prêt » apparaît une seule fois dans tout le flux d'events.
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
        "la réponse ne doit apparaître qu'UNE fois (pas de double-rédaction) ; \
         events={events:?}"
    );
    assert!(
        matches!(events.last(), Some(AgentEvent::Stop { .. })),
        "le run doit finir par Stop ; events={events:?}"
    );
}

#[tokio::test]
async fn tool_call_after_explicit_phase_does_not_synthesize() {
    // Le modèle déclare `reading` puis `planning` avant echo : pas de
    // phase synthétisée avant le tool. `todo_write` d'abord.
    let tu_todo = ToolUseId::new();
    let tu_echo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nCadrage.\n[phase: planning]\nOn liste d'abord.\n"
                    .into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo,
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [{
                        "id": "1",
                        "content": "Echo test",
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
    // Tour 1 : glob seul (todo pas encore posée) — autorisé ; phase synthétisée Reading.
    // Tour 2 : todo. Tour 3 : glob sans marqueur → synthèse Reading.
    let tu1 = ToolUseId::new();
    let tu3 = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
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
        read_then_one_todo_turn("Lister le repo."),
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
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
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
        .expect("glob doit être précédé d'un PhaseEnter");
    assert_eq!(glob_phase, Phase::Reading, "glob orphelin → Reading");
}
