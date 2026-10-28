//! Profils moteur 1.6.1 (`local-9b` / `local-27b` / `cloud-full`) — clôture et gates parent.

use super::*;

fn text_turn(text: &str) -> Vec<StreamEvent> {
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta { text: text.into() },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ]
}

fn edit_turn() -> Vec<StreamEvent> {
    vec![
        StreamEvent::Start,
        StreamEvent::ToolCall {
            id: ToolUseId::new(),
            name: "file_edit".into(),
            arguments: json!({ "path": "src/page.tsx", "old_string": "a", "new_string": "b" }),
        },
        StreamEvent::Stop {
            reason: StopReason::ToolUse,
            usage: Usage::default(),
        },
    ]
}

fn config(profile: &str, max_iterations: usize) -> AgentConfig {
    AgentConfig {
        engine_profile: profile.into(),
        max_iterations,
        ..AgentConfig::default()
    }
}

fn registry() -> Arc<ToolRegistry> {
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeFileEditTool));
    Arc::new(registry)
}

async fn run(llm: Vec<Vec<StreamEvent>>, cfg: AgentConfig) -> Vec<Result<AgentEvent, EngineError>> {
    let llm = Arc::new(ScriptedLlm::new(llm));
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry(), ctx, cfg);
    agent.run("fais le travail").collect::<Vec<_>>().await
}

fn stopped_cleanly(events: &[Result<AgentEvent, EngineError>]) -> bool {
    matches!(events.last(), Some(Ok(AgentEvent::Stop { .. })))
}

fn answering_text(events: &[Result<AgentEvent, EngineError>], needle: &str) -> bool {
    events
        .iter()
        .any(|e| matches!(e, Ok(AgentEvent::TextDelta { text }) if text.contains(needle)))
}

#[tokio::test]
async fn local_9b_text_turn_without_markers_closes_run() {
    let events = run(vec![text_turn("Voici la réponse.")], config("local-9b", 12)).await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(events
        .iter()
        .any(|e| matches!(e, Ok(AgentEvent::PhaseEnter { phase: Phase::Answering }))));
    assert!(events
        .iter()
        .any(|e| matches!(e, Ok(AgentEvent::PhaseEnter { phase: Phase::Done }))));
    assert!(answering_text(&events, "Voici la réponse."));
}

#[tokio::test]
async fn local_9b_mutation_without_todo_is_not_blocked() {
    let events = run(
        vec![edit_turn(), text_turn("[phase: answering]\nFait.")],
        config("local-9b", 12),
    )
    .await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(
        events.iter().any(|e| matches!(
            e,
            Ok(AgentEvent::ToolFinish { is_error: false, .. })
        )),
        "file_edit must run without todo_write in local-9b: {events:?}"
    );
}

#[tokio::test]
async fn cloud_full_still_requires_phase_done() {
    // Texte sans `[phase: done]` : pas de clôture moteur, le run est relancé (protocole 1.6.0).
    let events = run(vec![text_turn("Voici la réponse.")], config("cloud-full", 3)).await;
    assert!(!stopped_cleanly(&events), "{events:?}");
    assert!(matches!(events.last(), Some(Err(_))));
}

#[tokio::test]
async fn local_9b_budget_forces_final_answer_turn() {
    // max_iterations = 4 → réserve 2 : tours 0-1 outils, tour 2 sans outils.
    let events = run(
        vec![
            edit_turn(),
            edit_turn(),
            text_turn("Bilan : deux éditions faites."),
        ],
        config("local-9b", 4),
    )
    .await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(answering_text(&events, "Bilan"));
}

#[tokio::test]
async fn local_9b_salvages_inline_todo_json_then_closes() {
    let events = run(
        vec![
            text_turn(
                "Salut !\n{\"todos\":[{\"id\":\"1\",\"content\":\"Répondre\",\"status\":\"completed\"}]}",
            ),
            text_turn("Comment puis-je t'aider ?"),
        ],
        config("local-9b", 12),
    )
    .await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(events.iter().any(|e| matches!(
        e,
        Ok(AgentEvent::ToolStart { name, .. }) if name == "todo_write"
    )));
    assert!(events.iter().any(|e| matches!(
        e,
        Ok(AgentEvent::ToolFinish { is_error: false, .. })
    )));
    assert!(answering_text(&events, "Comment puis-je t'aider"));
}

#[tokio::test]
async fn local_27b_soft_close_check_is_one_shot() {
    let events = run(
        vec![
            edit_turn(),
            text_turn("[phase: answering]\nFini."),
            text_turn("[phase: answering]\nFini, rien à tester."),
        ],
        config("local-27b", 12),
    )
    .await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(answering_text(&events, "rien à tester"));
}

#[tokio::test]
async fn cloud_full_done_only_ignored_hides_rewritten_conclusion() {
    let events = run(
        vec![
            text_turn("[phase: answering]\nBilan initial."),
            text_turn("[phase: answering]\nBilan réécrit une deuxième fois."),
            text_turn("[phase: answering]\nBilan réécrit une troisième fois."),
        ],
        config("cloud-full", 8),
    )
    .await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(answering_text(&events, "Bilan initial."));
    assert!(!answering_text(&events, "deuxième"));
    assert!(!answering_text(&events, "troisième"));
}

#[tokio::test]
async fn cloud_full_done_only_then_marker_closes() {
    let events = run(
        vec![
            text_turn("[phase: answering]\nBilan initial."),
            text_turn("[phase: done]"),
        ],
        config("cloud-full", 8),
    )
    .await;
    assert!(stopped_cleanly(&events), "{events:?}");
    assert!(answering_text(&events, "Bilan initial."));
    assert!(events.iter().any(|e| matches!(
        e,
        Ok(AgentEvent::PhaseEnter { phase: Phase::Done })
    )));
}
