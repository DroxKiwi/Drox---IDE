//! Stream LLM : consume_stream, TurnOutcome, helpers promotion UI.

mod consume;

pub(crate) use consume::consume_stream;


use drox_types::{Content, Message, Role, StopReason, ToolUseId, Usage};
use serde_json::Value;
use tracing::debug;

use crate::event::Phase;
use crate::run_spec::{RoleId, RunSpec};
use super::phases::strip_phase_protocol_lines;
#[derive(Clone)]
pub(crate) struct PendingToolCall {
    pub id: ToolUseId,
    pub name: String,
    pub arguments: Value,
}

/// Applique `RunSpec::max_tools_per_turn` sur les appels outils d'un tour.
///
/// Exception Low + sous-agents : jusqu'à `min(subagent_max_concurrent, 2)` appels
/// `task` avec `background: true` dans le **même** tour (lancement parallèle).
pub(crate) fn enforce_max_tools_per_turn(
    tool_calls: &mut Vec<PendingToolCall>,
    spec: &RunSpec,
) {
    let Some(max) = spec.max_tools_per_turn() else {
        return;
    };
    if tool_calls.len() > max {
        debug!(
            role = ?spec.role_id,
            max,
            dropped = tool_calls.len() - max,
            "truncating assistant tool_calls for run spec"
        );
        tool_calls.truncate(max);
    }
}


pub(crate) struct TurnOutcome {
    /// Texte assistant **nettoyÃ©** : tous les marqueurs `[phase: ...]` reconnus
    /// ont Ã©tÃ© retirÃ©s (y compris les lignes `reasoning` / `next-move` ignorÃ©es).
    /// C'est ce qui est poussÃ© dans le transcript et renvoyÃ© au LLM aux tours
    /// suivants â€” le contexte sÃ©mantique pour le modÃ¨le, sans la quincaillerie
    /// protocolaire.
    pub text: String,
    pub tool_calls: Vec<PendingToolCall>,
    pub reason: StopReason,
    pub usage: Usage,
    /// DerniÃ¨re phase dÃ©clarÃ©e dans ce tour, si prÃ©sente. UtilisÃ©e par
    /// `drive_inner` pour dÃ©cider de la clÃ´ture (cf. `Phase::Done`).
    pub final_phase: Option<Phase>,
    /// `true` si la phase `Answering` a Ã©tÃ© dÃ©clarÃ©e Ã  un moment ou un autre
    /// pendant ce tour. Sert Ã  dÃ©tecter les `Done` prÃ©maturÃ©s oÃ¹ le modÃ¨le
    /// Ã©crit sa synthÃ¨se dans `reading`/`verifying` puis ferme sans passer
    /// par `answering` (cf. Sprint A.3 â€” answering-before-done).
    pub saw_answering: bool,
    /// Premier `[run_objective: â€¦]` du tour (dÃ©fini par le modÃ¨le).
    pub run_objective: Option<String>,
}

/// Ajoute le message assistant au log de conversation (`text` + `tool_uses`).
pub(crate) fn push_assistant_message(messages: &mut Vec<Message>, outcome: &TurnOutcome) {
    let mut blocks = Vec::new();
    if !outcome.text.is_empty() {
        blocks.push(Content::text(&outcome.text));
    }
    for call in &outcome.tool_calls {
        blocks.push(Content::ToolUse {
            id: call.id.clone(),
            name: call.name.clone(),
            input: call.arguments.clone(),
        });
    }
    if !blocks.is_empty() {
        messages.push(Message::new(Role::Assistant, blocks));
    }
}

#[must_use]
pub(crate) fn message_plain_text(m: &Message) -> String {
    let mut buf = String::new();
    for block in &m.content {
        if let Content::Text { text } = block {
            if !buf.is_empty() {
                buf.push('\n');
            }
            buf.push_str(text);
        }
    }
    buf
}

#[cfg(test)]
mod enforce_tests {
    use super::*;
    use crate::run_spec::RunSpec;
    use drox_types::ToolUseId;
    use serde_json::json;

    #[test]
    fn enforce_max_tools_per_turn_truncates_when_cap_low() {
        let mut spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        spec.limits.max_tools_per_turn = Some(2);
        let mut calls = vec![
            PendingToolCall {
                id: ToolUseId::new(),
                name: "glob".into(),
                arguments: json!({}),
            },
            PendingToolCall {
                id: ToolUseId::new(),
                name: "grep".into(),
                arguments: json!({}),
            },
            PendingToolCall {
                id: ToolUseId::new(),
                name: "file_read".into(),
                arguments: json!({}),
            },
        ];
        enforce_max_tools_per_turn(&mut calls, &spec);
        assert_eq!(calls.len(), 2);
    }

    #[test]
    fn enforce_max_tools_per_turn_noop_for_standard() {
        let spec = RunSpec::default();
        let mut calls = vec![
            PendingToolCall {
                id: ToolUseId::new(),
                name: "glob".into(),
                arguments: json!({}),
            },
            PendingToolCall {
                id: ToolUseId::new(),
                name: "grep".into(),
                arguments: json!({}),
            },
        ];
        enforce_max_tools_per_turn(&mut calls, &spec);
        assert_eq!(calls.len(), 2);
    }
}

#[must_use]
pub(crate) fn promotable_answer_min_chars(role_id: RoleId, tuning: &crate::EngineTuning) -> usize {
    if role_id == RoleId::ArchitectDiscussion {
        tuning.discussion_promotable_min_chars as usize
    } else {
        tuning.promotable_answer_min_chars as usize
    }
}

#[must_use]
pub(crate) fn run_has_promotable_user_facing_text(
    outcome: &TurnOutcome,
    messages: &[Message],
    role_id: RoleId,
    tuning: &crate::EngineTuning,
) -> bool {
    let min = promotable_answer_min_chars(role_id, tuning);
    let from_outcome = strip_phase_protocol_lines(&outcome.text);
    if from_outcome.trim().chars().count() >= min {
        return true;
    }
    for m in messages.iter().rev() {
        if !matches!(m.role, Role::Assistant) {
            continue;
        }
        let plain = strip_phase_protocol_lines(&message_plain_text(m));
        if plain.trim().chars().count() >= min {
            return true;
        }
    }
    false
}
