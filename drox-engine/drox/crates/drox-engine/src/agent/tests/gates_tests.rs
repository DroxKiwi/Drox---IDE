//! Tests des gates moteur (todo_write, professor, mutation/testing, recreation).

use super::*;

/// Sprint A.7 — relax de la gate aux read-only.
///
/// `echo` (proxy d'un read-only en test) appelé **avant** tout
/// `todo_write` ne doit plus déclencher la gate
/// `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED`. C'était le faux `× Listed *`
/// observé en début de chaque conversation : GLM appelle `glob` seul,
/// le moteur le rejetait, le modèle retentait, et après 1-2 essais
/// finissait par enchaîner. Maintenant, exploration libre.
#[tokio::test]
async fn read_only_tool_before_todo_write_is_allowed() {
    let tid_echo = ToolUseId::new();
    let tid_todo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : reasoning + echo SEUL (pas de todo_write).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe regarde rapidement.\n\
                       [phase: reading]\n"
                    .into(),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
                name: "echo".into(),
                arguments: json!({ "v": 1 }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : maintenant il pose son plan (todo_write seule).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: planning]\nMaintenant je plan.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_todo.clone(),
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
        done_turn("OK."),
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

    let echo_ok = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_echo
        )
    });
    assert!(
        echo_ok,
        "echo (read-only proxy) doit s'exécuter sans erreur avant todo_write ; events={events:?}"
    );

    let any_error = events.iter().any(
        |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
    );
    assert!(
        !any_error,
        "aucun ToolFinish en erreur — la gate ne s'applique plus aux read-only ; events={events:?}"
    );
}

/// Sprint A.7 — la gate reste **dure** sur les mutateurs shell.
///
/// `bash` **mutateur** (`git add`, `rm`, …) appelé sans `todo_write`
/// préalable doit recevoir `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED`.
/// Les commandes inspectives (`git status`, `ls`) sont exemptées.
#[tokio::test]
async fn mutating_tool_before_todo_write_still_blocked() {
    let tid_bash = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : reasoning + bash mutateur SEUL (pas de todo_write).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe vais stager.\n\
                       [phase: acting]\n"
                    .into(),
            },
            StreamEvent::ToolCall {
                id: tid_bash.clone(),
                name: "bash".into(),
                arguments: json!({ "command": "git add -A" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeBashTool));
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

    let bash_blocked = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                id,
                is_error: true,
                output,
                ..
            } if id == &tid_bash
                && output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.contains("mutating") || s.contains("Planning"))
        )
    });
    assert!(
        bash_blocked,
        "bash mutateur sans todo_write préalable doit être bloqué ; events={events:?}"
    );
}

/// Inspect-only `bash` (`git status`) must run before any `todo_write`.
#[tokio::test]
async fn read_only_bash_allowed_before_todo_write() {
    let tid_bash = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nInspect repo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_bash.clone(),
                name: "bash".into(),
                arguments: json!({ "command": "git status --short" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("Clean or dirty — inspected."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeBashTool));
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

    let bash_ok = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                id,
                is_error: false,
                ..
            } if id == &tid_bash
        )
    });
    assert!(
        bash_ok,
        "git status must run without prior todo_write ; events={events:?}"
    );
}

#[tokio::test]
async fn professor_file_edit_blocked_without_course_plan() {
    use crate::permissions::PermissionPolicy;
    use drox_permissions::{PermissionEngine, PermissionMode, RuleSet};

    let tid_edit = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_edit.clone(),
                name: "file_edit".into(),
                arguments: json!({
                    "path": "src/page.tsx",
                    "edits": [{ "old_string": "a", "new_string": "b" }]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("OK."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(FakeFileEditTool));
    let registry = Arc::new(registry);

    let policy = PermissionPolicy::new(
        Arc::new(PermissionEngine::with_rules(RuleSet::new())),
        PermissionMode::Professor,
    );
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let cfg = AgentConfig {
        permissions: Some(policy),
        ..AgentConfig::default()
    };
    let agent = Agent::new(llm, registry, ctx, cfg);

    let mut blocked = false;
    let mut stream = std::pin::pin!(agent.run("modifie la page d'accueil"));
    while let Some(item) = stream.next().await {
        match item {
            Ok(AgentEvent::ToolFinish {
                id,
                is_error: true,
                output,
                ..
            }) if id.clone() == tid_edit
                && output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.contains("course_plan_write")) =>
            {
                blocked = true;
                break;
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    assert!(
        blocked,
        "file_edit en mode professeur sans plan doit être bloqué"
    );
}

/// Cas observé GLM-4.7-Flash : le modèle bat che `[file_edit, todo_write]`
/// (ou `[bash, todo_write]`) dans le même tour. Sans le réordonnement,
/// le mutateur rate la gate `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` au
/// premier outil → UI affiche `× Edited foo.rs`. Avec le réordonnement,
/// `todo_write` est exécuté en premier, le mutateur ensuite, les deux
/// passent silencieusement.
///
/// Note : `echo` n'est PAS un mutateur (outil de test simple).
/// On teste l'ordre d'exécution quand un batch contient `todo_write`
/// non en tête — la gate mutateurs ne s'applique pas à `echo`.
#[tokio::test]
async fn todo_write_promoted_when_batched_with_other_tool() {
    let tid_echo = ToolUseId::new();
    let tid_todo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nPlan + explore en un coup.\n\
                       [phase: reading]\n"
                    .into(),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
                name: "echo".into(),
                arguments: json!({ "value": "ping" }),
            },
            StreamEvent::ToolCall {
                id: tid_todo.clone(),
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
        done_turn("OK."),
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

    let any_error = events.iter().any(
        |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
    );
    assert!(
        !any_error,
        "le batch [echo, todo_write] doit être réordonné, donc aucun ToolFinish en erreur ; events={events:?}"
    );

    let echo_finished_ok = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_echo
        )
    });
    let todo_finished_ok = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_todo
        )
    });
    assert!(
        echo_finished_ok && todo_finished_ok,
        "echo ET todo_write doivent finir sans erreur ; events={events:?}"
    );
}

/// Anti-régression : quand un `todo_write` a déjà réussi dans le run,
/// l'ordre relatif du modèle est respecté (pas de promotion silencieuse
/// au-delà de la première satisfaction de la gate).
#[tokio::test]
async fn todo_write_not_promoted_once_gate_already_satisfied() {
    let tid_echo = ToolUseId::new();
    let tid_todo2 = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : todo_write seul (satisfait la gate).
        read_then_one_todo_turn("Premier plan."),
        // Tour 2 : modèle bat che [echo, todo_write] dans un ordre
        // volontaire — on veut que l'ordre soit conservé (echo exécuté
        // en premier puis nouvelle MAJ du plan).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_echo.clone(),
                name: "echo".into(),
                arguments: json!({ "value": "ping" }),
            },
            StreamEvent::ToolCall {
                id: tid_todo2.clone(),
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
        done_turn("OK."),
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

    // Aucun ToolFinish en erreur (les deux passent toujours).
    let any_error = events.iter().any(
        |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
    );
    assert!(!any_error, "events={events:?}");

    // Garde-fou comportemental : l'ordre des ToolFinish (echo puis
    // todo_write n°2) doit correspondre à l'ordre demandé par le
    // modèle, pas être inversé par le réordonnement.
    let finish_seq: Vec<&ToolUseId> = events
        .iter()
        .filter_map(|e| match e {
            AgentEvent::ToolFinish { id, .. } => Some(id),
            _ => None,
        })
        .collect();
    // 3 ToolFinish attendus : tour 1 (todo_write n°1), tour 2 (echo), tour 2 (todo_write n°2).
    // On ne vérifie que l'ordre relatif des deux du tour 2 :
    let echo_pos = finish_seq.iter().position(|id| *id == &tid_echo);
    let todo2_pos = finish_seq.iter().position(|id| *id == &tid_todo2);
    match (echo_pos, todo2_pos) {
        (Some(e), Some(t)) => assert!(
            e < t,
            "ordre relatif modèle préservé (echo avant todo_write n°2) ; finish_seq={finish_seq:?}"
        ),
        _ => panic!("echo et todo_write n°2 doivent être finis ; events={events:?}"),
    }
}

#[tokio::test]
async fn done_blocked_when_code_edited_without_testing() {
    let tid_bash = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        todo_then_code_edit_turn("src/lib.rs"),
        done_turn("réponse sans test"),
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: testing]\ncheck\n".into(),
            },
            StreamEvent::ToolCall {
                id: tid_bash,
                name: "bash".into(),
                arguments: json!({ "command": "cargo check" }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        done_turn("réponse après test"),
        done_turn("réponse après test"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeFileEditTool));
    registry.register(Arc::new(FakeBashTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let raw: Vec<_> = agent.run("corrige le bug").collect().await;
    let events: Vec<AgentEvent> = raw.into_iter().filter_map(Result::ok).collect();

    let testing_idx = events
        .iter()
        .position(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Testing }));
    assert!(
        testing_idx.is_some(),
        "expected Testing phase after code edit nudge, got {events:?}"
    );
    let testing_idx = testing_idx.unwrap();
    assert!(
        !events[..testing_idx]
            .iter()
            .any(|e| matches!(e, AgentEvent::Stop { .. })),
        "run must not Stop before testing phase"
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
        "expected eventual Done, got {events:?}"
    );
}

#[tokio::test]
async fn done_allowed_when_only_markdown_edited() {
    let llm = Arc::new(ScriptedLlm::new(vec![
        todo_then_code_edit_turn("docs/README.md"),
        done_turn("doc mise à jour"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    registry.register(Arc::new(FakeFileEditTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let raw: Vec<_> = agent.run("mets à jour le readme").collect().await;
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
    // Scénario : le modèle ouvre la to-do en `in_progress` puis tente de
    // clôturer directement (réponse + done). La nouvelle gate doit refuser
    // ce `done` (todo non clôturée) et nudger. Le tour 3 met à jour la
    // to-do en `completed` et seulement là le moteur accepte de fermer.
    let tid_close = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : ouverture de la to-do (in_progress).
        read_then_one_todo_turn_with_status(
            "Je vais traiter la demande.",
            "in_progress",
        ),
        // Tour 2 : answering + done, mais la to-do est toujours ouverte
        // → la gate doit nudger et NE PAS clôturer.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: answering]\nréponse hâtive\n[phase: done]".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ],
        // Tour 3 : le modèle clôture la to-do puis re-tente.
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
                        "content": "Étape de test",
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
                text: "[phase: answering]\nréponse finale\n[phase: done]".into(),
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
        .run("salut")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    // On exige qu'on ait vu DEUX appels todo_write (ouverture + clôture).
    let todo_finishes = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::ToolFinish { is_error: false, .. }))
        .count();
    assert!(
        todo_finishes >= 2,
        "expected at least 2 successful todo_write tool finishes (open + close), got {todo_finishes} — events: {events:?}",
    );

    // Le run doit se clôturer normalement (Stop final) : la gate finit
    // par accepter `done` une fois la to-do passée en `completed`.
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
        "expected PhaseEnter(Done) eventually, got {events:?}",
    );
    assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));

    // La réponse finale doit être celle du tour 4, pas la hâtive du tour 2.
    assert!(
        events
            .iter()
            .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("réponse finale"))),
        "expected final answer to come from the post-close turn, got {events:?}",
    );
}

#[test]
fn record_counts_as_code_mutation_heuristic() {
    assert!(record_counts_as_code_mutation(
        "file_edit",
        &json!({ "path": "src/lib.rs" })
    ));
    assert!(!record_counts_as_code_mutation(
        "file_edit",
        &json!({ "path": "README.md" })
    ));
    assert!(record_counts_as_code_mutation("notebook_edit", &json!({})));
    assert!(!record_counts_as_code_mutation(
        "bash",
        &json!({ "command": "git commit -F .drox/COMMIT_MSG" })
    ));
    assert!(!record_counts_as_code_mutation(
        "bash",
        &json!({ "command": "git add -A && git status" })
    ));
    assert!(record_counts_as_code_mutation(
        "bash",
        &json!({ "command": "npm install lodash" })
    ));
}

#[test]
fn bash_inspect_only_via_drox_bash() {
    assert!(command_is_inspect_only("git status --short"));
    assert!(command_is_inspect_only("git log --oneline -20"));
    assert!(command_is_inspect_only("git diff --cached"));
    assert!(command_is_inspect_only("ls"));
    assert!(command_is_inspect_only("FOO=1 git status"));
    assert!(command_is_inspect_only("git status && git log -1"));
    assert!(command_is_inspect_only("cargo check"));
    assert!(command_is_inspect_only(
        "ls -la | grep \"^-\" | awk '{print $NF}'"
    ));
    assert!(!command_is_inspect_only("git add -A"));
    assert!(!command_is_inspect_only("git commit -F msg"));
    assert!(!command_is_inspect_only("git status && git add -A"));
    assert!(!command_is_inspect_only("echo hi > file.txt"));
    assert!(command_is_inspect_only(
        "git show HEAD:.env > %TEMP%\\drox_env_hist.txt && findstr DATABASE %TEMP%\\drox_env_hist.txt"
    ));
    let ws = camino::Utf8Path::new(".");
    assert!(!requires_todo_write_gate(
        "bash",
        &json!({ "command": "git status" }),
        ws
    ));
    assert!(!requires_todo_write_gate(
        "bash",
        &json!({ "command": "cargo check" }),
        ws
    ));
    assert!(!requires_todo_write_gate(
        "bash",
        &json!({ "command": "git show HEAD:.env > %TEMP%\\x.txt" }),
        ws
    ));
    assert!(requires_todo_write_gate(
        "bash",
        &json!({ "command": "git add -A" }),
        ws
    ));
    assert!(requires_todo_write_gate(
        "bash",
        &json!({ "command": "echo hi > file.txt" }),
        ws
    ));
}

/// Sprint Plan « un seul plan par run » — quand le modèle clôture toutes
/// les étapes d'une liste puis tente d'en re-créer une nouvelle from
/// scratch (ids inédits), le moteur rejette l'appel avec
/// `TODO_RECREATION_BLOCKED` et laisse au modèle l'opportunité de
/// re-soumettre avec les anciens items en `completed` + nouveaux items.
#[tokio::test]
async fn todo_recreation_after_all_completed_is_blocked() {
    let tu1 = ToolUseId::new();
    let tu2 = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : plan A à 1 item directement completed.
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
                        { "id": "1", "content": "étape A", "status": "completed" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : tentative de re-création avec ids tout neufs (plan B).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nPlan B from scratch.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu2.clone(),
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "10", "content": "étape B1", "status": "pending" },
                        { "id": "11", "content": "étape B2", "status": "in_progress" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 3 : conformément au nudge, soumet plan A en completed
        // + plan B en pending → accepté, puis clôture.
        done_turn("OK"),
    ]));
    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let raw: Vec<_> = agent.run("essai").collect::<Vec<_>>().await;
    // Attendu : un ToolFinish avec is_error: true pour le tu2 (le plan B),
    // contenant le message de re-création.
    let blocked = raw.iter().any(|ev| match ev {
        Ok(AgentEvent::ToolFinish {
            id,
            output,
            is_error,
        }) => {
            *is_error
                && id == &tu2
                && output
                    .to_string()
                    .contains("Blocked: you tried to **replace**")
        }
        _ => false,
    });
    assert!(
        blocked,
        "le tour 2 (plan B from scratch) devait être bloqué avec TODO_RECREATION_BLOCKED"
    );
}

/// Sprint Plan — anti-faux-positif : un `todo_write` qui **mette à jour**
/// la liste (mêmes ids, statuts changés + nouveaux ids ajoutés) doit
/// passer SANS rejet, même si la liste précédente était all-completed.
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
                        { "id": "1", "content": "étape A", "status": "completed" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : reprend l'id "1" en completed + ajoute "2" en pending.
        // → extension légitime, doit passer.
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
                        { "id": "1", "content": "étape A", "status": "completed" },
                        { "id": "2", "content": "étape B", "status": "completed" }
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
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
        "une extension légitime (ids communs préservés) ne doit pas être bloquée"
    );
}

/// Format-check du helper `step_by_step_todo_nudge` : il doit nommer le
/// compte d'outils mutateurs, les compteurs `pending` / `in_progress`, et
/// rappeler le bon mantra ("one `todo_write` per real step transition").
#[test]
fn step_by_step_nudge_message_mentions_counters_and_principle() {
    let msg = step_by_step_todo_nudge(3, 4, 1);
    assert!(msg.contains("3 mutating tools"), "msg={msg}");
    assert!(msg.contains("4 pending"), "msg={msg}");
    assert!(msg.contains("1 in_progress"), "msg={msg}");
    assert!(msg.contains("todo_write"), "msg={msg}");
    assert!(msg.contains("mutating bash"), "msg={msg}");
    assert!(msg.contains("Inspect-only bash"), "msg={msg}");
    assert!(
        msg.contains("step transition") || msg.contains("step-by-step"),
        "le nudge doit rappeler la granularité step-by-step ; msg={msg}"
    );
}

/// Anti-régression : scénario réel observé sur GLM-4.7-Flash — le modèle
/// crée un plan de 3 étapes puis enchaîne 3 outils mutateurs sans MAJ
/// intermédiaire. Le filet moteur doit injecter un nudge `step_by_step`
/// SANS bloquer le run (le tour avec les outils est accepté ; le nudge
/// influence le tour suivant). Le test vérifie surtout que la séquence
/// arrive à `Stop` propre, et que les outils mutateurs sont bien exécutés.
#[allow(clippy::too_many_lines)]
#[tokio::test]
async fn run_completes_when_model_batches_mutating_tools_then_updates_todo() {
    let tu_todo_open = ToolUseId::new();
    let tu_bash_1 = ToolUseId::new();
    let tu_bash_2 = ToolUseId::new();
    let tu_todo_close = ToolUseId::new();

    let llm = Arc::new(ScriptedLlm::new(vec![
        // Tour 1 : reasoning + plan en 2 étapes (in_progress + pending).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe planifie en 2 étapes.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo_open.clone(),
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "1", "content": "Étape 1", "status": "in_progress" },
                        { "id": "2", "content": "Étape 2", "status": "pending" }
                    ]
                }),
            },
            StreamEvent::Stop {
                reason: StopReason::ToolUse,
                usage: Usage::default(),
            },
        ],
        // Tour 2 : deux `bash` à la suite sans `todo_write` intercalé →
        // le moteur va injecter `step_by_step_todo_nudge` en fin de tour.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\nLes deux étapes en backend.\n".into(),
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
        // Tour 3 : le modèle reçoit le nudge, ferme la todo proprement
        // puis émet answering + done.
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: acting]\nJe mets à jour la todo.\n".into(),
            },
            StreamEvent::ToolCall {
                id: tu_todo_close.clone(),
                name: "todo_write".into(),
                arguments: json!({
                    "todos": [
                        { "id": "1", "content": "Étape 1", "status": "completed" },
                        { "id": "2", "content": "Étape 2", "status": "completed" }
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
    registry.register(Arc::new(FakeBashTool));
    let registry = Arc::new(registry);
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
        "les 2 bash batched doivent quand même s'exécuter (le nudge ne bloque pas) ; events={events:?}"
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
        "les 2 todo_write (ouvert + clôture) doivent réussir ; events={events:?}"
    );

    assert!(
        matches!(events.last(), Some(AgentEvent::Stop { .. })),
        "le run doit clôturer proprement après le nudge ; events={events:?}"
    );
}

/// Anti-régression : sur un simple « Salut », le moteur DOIT accepter
/// `[phase: reading] → [phase: answering] → [phase: done]` sans
/// `todo_write`. La gate qui exigeait `todo_write` avant `done` causait
/// une boucle infinie (le modèle ré-écrivait sa salutation à chaque
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
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

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
        "aucun todo_write ne doit être déclenché pour une conversation triviale ; \
         events={events:?}",
    );
    let stops = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::Stop { .. }))
        .count();
    assert_eq!(
        stops, 1,
        "le moteur doit clôturer en UN seul tour pour une salutation \
         (la boucle infinie vient d'une absence de Stop) ; events={events:?}",
    );
    assert!(
        matches!(events.last(), Some(AgentEvent::Stop { .. })),
        "le dernier événement doit être Stop ; events={events:?}",
    );
}
