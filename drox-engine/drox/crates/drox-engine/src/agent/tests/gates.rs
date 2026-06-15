use std::sync::Arc;

use super::support::*;
use crate::agent::*;
use crate::event::{AgentEvent, Phase};
use drox_tools::{TodoWriteTool, ToolContext, ToolRegistry};
use drox_types::{StopReason, StreamEvent, ToolUseId, Usage};
use futures::StreamExt;
use serde_json::json;


/// Read-only tools (`echo` en test) avant tout `todo_write` doivent passer
/// sans blocage pré-exécution.
#[tokio::test]
async fn read_only_tool_before_todo_write_is_allowed() {
    let tid_echo = ToolUseId::new();
    let tid_todo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
                        "content": "Ã‰tape",
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

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
        "echo (read-only proxy) doit s'exÃ©cuter sans erreur avant todo_write ; events={events:?}"
    );

    let any_error = events.iter().any(
        |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
    );
    assert!(
        !any_error,
        "aucun ToolFinish en erreur â€” la gate ne s'applique plus aux read-only ; events={events:?}"
    );
}

/// Les outils mutants (`bash` en test) passent sans `todo_write` préalable —
/// pas de gate bloquante legacy.
#[tokio::test]
async fn mutating_tool_before_todo_write_is_allowed() {
    let tid_bash = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        // Tour 1 : reasoning + bash SEUL (mutateur, pas de todo_write).
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nJe vais lancer un script.\n\
                       [phase: acting]\n"
                    .into(),
            },
            StreamEvent::ToolCall {
                id: tid_bash.clone(),
                name: "bash".into(),
                arguments: json!({ "command": "ls" }),
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

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
        "bash sans todo_write prÃ©alable doit s'exÃ©cuter (gate assouplie) ; events={events:?}"
    );
    let any_mutating_block = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                is_error: true,
                output,
                ..
            } if output
                .get("error")
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.contains("Blocked") && s.contains("mutating"))
        )
    });
    assert!(
        !any_mutating_block,
        "aucun blocage dur mutating-before-todo ; events={events:?}"
    );
}

/// Cas observÃ© GLM-4.7-Flash : le modÃ¨le bat che `[file_edit, todo_write]`
/// (ou `[bash, todo_write]`) dans le mÃªme tour. Sans le rÃ©ordonnement,
/// le mutateur rate la gate `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` au
/// premier outil â†’ UI affiche `Ã— Edited foo.rs`. Avec le rÃ©ordonnement,
/// `todo_write` est exÃ©cutÃ© en premier, le mutateur ensuite, les deux
/// passent silencieusement.
///
/// Note : `echo` n'est PAS un mutateur (cf. `MUTATING_TOOLS_FOR_STEP_TRACKING`).
/// On utilise quand mÃªme `echo` ici par commoditÃ© (tool de test simple),
/// mais ce qu'on teste rÃ©ellement c'est l'ordre d'exÃ©cution prÃ©servÃ©
/// quand un batch contient `todo_write` non en tÃªte. La gate elle-mÃªme
/// n'est plus dÃ©clenchÃ©e par `echo` depuis le relax read-only.
#[tokio::test]
async fn todo_write_promoted_when_batched_with_other_tool() {
    let tid_echo = ToolUseId::new();
    let tid_todo = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
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
                        "content": "Ã‰tape",
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

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
        "le batch [echo, todo_write] doit Ãªtre rÃ©ordonnÃ©, donc aucun ToolFinish en erreur ; events={events:?}"
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

/// Anti-rÃ©gression : quand un `todo_write` a dÃ©jÃ  rÃ©ussi dans le run,
/// l'ordre relatif du modÃ¨le est respectÃ© (pas de promotion silencieuse
/// au-delÃ  de la premiÃ¨re satisfaction de la gate).
#[tokio::test]
async fn todo_write_not_promoted_once_gate_already_satisfied() {
    let tid_echo = ToolUseId::new();
    let tid_todo2 = ToolUseId::new();
    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        // Tour 1 : todo_write seul (satisfait la gate).
        read_then_one_todo_turn("Premier plan."),
        // Tour 2 : modÃ¨le bat che [echo, todo_write] dans un ordre
        // volontaire â€” on veut que l'ordre soit conservÃ© (echo exÃ©cutÃ©
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
                        "content": "Ã‰tape",
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
    let agent = Agent::new(llm, registry, ctx, test_agent_config());

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
    // todo_write nÂ°2) doit correspondre Ã  l'ordre demandÃ© par le
    // modÃ¨le, pas Ãªtre inversÃ© par le rÃ©ordonnement.
    let finish_seq: Vec<&ToolUseId> = events
        .iter()
        .filter_map(|e| match e {
            AgentEvent::ToolFinish { id, .. } => Some(id),
            _ => None,
        })
        .collect();
    // 3 ToolFinish attendus : tour 1 (todo_write nÂ°1), tour 2 (echo), tour 2 (todo_write nÂ°2).
    // On ne vÃ©rifie que l'ordre relatif des deux du tour 2 :
    let echo_pos = finish_seq.iter().position(|id| *id == &tid_echo);
    let todo2_pos = finish_seq.iter().position(|id| *id == &tid_todo2);
    match (echo_pos, todo2_pos) {
        (Some(e), Some(t)) => assert!(
            e < t,
            "ordre relatif modÃ¨le prÃ©servÃ© (echo avant todo_write nÂ°2) ; finish_seq={finish_seq:?}"
        ),
        _ => panic!("echo et todo_write nÂ°2 doivent Ãªtre finis ; events={events:?}"),
    }
}

#[tokio::test]
async fn hallucinated_phase_tool_skips_permission_ask_and_surfaces_engine_hint() {
    use crate::permissions::PermissionPolicy;
    use drox_permissions::{
        PermissionBehavior, PermissionEngine, PermissionMode, Rule, RuleSet, RuleSource,
        RuleValue,
    };

    let llm = Arc::new(ScriptedLlm::new_architect(vec![
        read_then_one_todo_turn("Plan minimal."),
        answering_turn_with_hallucinated_phase_tool(),
        done_turn("OK."),
    ]));

    let mut registry = ToolRegistry::new();
    registry.register(Arc::new(TodoWriteTool));
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

    let has_phase_recovered = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                is_error: false,
                output,
                ..
            } if output.get("recovered_phase").and_then(|v| v.as_str()) == Some("done")
        )
    });
    assert!(
        has_phase_recovered,
        "attendu rÃ©cupÃ©ration silencieuse de [phase: done] ; events={events:?}"
    );
    let has_phase_enter_done = events.iter().any(|e| {
        matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })
    });
    assert!(has_phase_enter_done, "attendu PhaseEnter::Done ; events={events:?}");
    let any_user_denied = events.iter().any(|e| {
        matches!(
            e,
            AgentEvent::ToolFinish {
                is_error: true,
                output,
                ..
            } if output
                .get("error")
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.contains("User denied permission"))
        )
    });
    assert!(
        !any_user_denied,
        "le faux outil phase ne doit pas passer par Ask â†’ refus ; events={events:?}"
    );
}
