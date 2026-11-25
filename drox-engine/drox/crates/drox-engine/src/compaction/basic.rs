//! Compaction déterministe (sans LLM) — filet de sécurité style Cline `basic-compaction`.

use drox_types::{Message, Role};

use crate::context_policy::ContextPolicy;

/// Fraction de la fenêtre effective à ne pas dépasser après compaction.
pub const BASIC_COMPACT_TARGET_RATIO: f32 = 0.70;

/// Rapport minimal d'une passe basic compact.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BasicCompactReport {
    pub tokens_before: usize,
    pub tokens_after: usize,
    pub messages_removed: usize,
}

const STUB: &str = "[Earlier tool output omitted by deterministic context compaction — re-read path if needed]";

/// Réduit l'historique en stubant les gros `tool_result` des messages anciens
/// tout en préservant `messages[0]` (system) et une queue récente.
#[must_use]
pub fn try_basic_compact(
    messages: &mut Vec<Message>,
    policy: &ContextPolicy,
    provider_input_floor: usize,
    autocompact_gate_tokens: Option<usize>,
) -> Option<BasicCompactReport> {
    let window = policy.budget().effective_window();
    let threshold = policy.budget().autocompact_threshold();
    let target = (window as f32 * BASIC_COMPACT_TARGET_RATIO) as usize;
    let tokens_before = policy.effective_token_count(messages, provider_input_floor);
    let gate = autocompact_gate_tokens.unwrap_or(tokens_before);
    if gate < threshold {
        return None;
    }

    let tail_keep = 4_usize
        .min(messages.len().saturating_sub(3))
        .max(1);
    if messages.len() <= tail_keep.saturating_add(1) {
        return None;
    }

    let tail_start = messages.len().saturating_sub(tail_keep);
    let old_len = messages.len();
    let mut changed = false;

    for (idx, msg) in messages.iter_mut().enumerate() {
        if idx == 0 || idx >= tail_start {
            continue;
        }
        if !matches!(msg.role, Role::Tool) {
            continue;
        }
        for block in msg.content.iter_mut() {
            if let drox_types::Content::ToolResult { content, .. } = block {
                if content.chars().count() > 400 {
                    *content = STUB.to_string();
                    changed = true;
                }
            }
        }
    }

    let tokens_mid = policy.effective_token_count(messages, provider_input_floor);
    if tokens_mid <= target {
        if !changed {
            return None;
        }
        return Some(BasicCompactReport {
            tokens_before,
            tokens_after: tokens_mid,
            messages_removed: old_len.saturating_sub(messages.len()),
        });
    }

    // Deuxième passe : retirer des messages entiers du milieu (sauf system).
    while messages.len() > tail_keep.saturating_add(2)
        && policy.effective_token_count(messages, provider_input_floor) > target
    {
        let remove_at = 1;
        if remove_at >= messages.len().saturating_sub(tail_keep) {
            break;
        }
        messages.remove(remove_at);
        changed = true;
    }

    let tokens_after = policy.effective_token_count(messages, provider_input_floor);
    if !changed || tokens_after >= tokens_before {
        return None;
    }

    Some(BasicCompactReport {
        tokens_before,
        tokens_after,
        messages_removed: old_len.saturating_sub(messages.len()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::ToolUseId;

    #[test]
    fn basic_compact_reduces_large_tool_results() {
        let policy = ContextPolicy::for_model_context_window(2048);
        let big = "x".repeat(80_000);
        let mut messages = vec![
            Message::system("sys"),
            Message::user("go"),
            Message::tool_result(ToolUseId::new(), big, false),
            Message::user("next"),
            Message::assistant("ok"),
        ];
        let report = try_basic_compact(&mut messages, &policy, 0, None);
        assert!(report.is_some());
        let report = report.unwrap();
        assert!(report.tokens_after <= report.tokens_before);
    }
}