//! Estimation charge requête LLM (messages + outils), style Cline `estimateRequestInputTokens`.

use crate::context_policy::ContextPolicy;
use drox_llm::ToolSpec;
use drox_types::Message;

/// Détail de l'estimation avant appel provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RequestLoadEstimate {
    pub message_tokens: usize,
    pub tools_tokens: usize,
    pub request_tokens: usize,
}

/// Estime les tokens d'une requête complète (historique transport + schémas d'outils).
#[must_use]
pub fn estimate_request_load(
    policy: &ContextPolicy,
    messages_for_model: &[Message],
    tool_specs: &[ToolSpec],
    extra_system_chars: Option<&str>,
) -> RequestLoadEstimate {
    let message_tokens = policy.count_tokens(messages_for_model);
    let mut tools_tokens = 0usize;
    if !tool_specs.is_empty() {
        let tools_json = serde_json::to_string(tool_specs).unwrap_or_default();
        tools_tokens = policy.count_text(&tools_json);
    }
    let mut request_tokens = message_tokens.saturating_add(tools_tokens);
    if let Some(extra) = extra_system_chars.filter(|s| !s.is_empty()) {
        request_tokens = request_tokens.saturating_add(policy.count_text(extra));
    }
    RequestLoadEstimate {
        message_tokens,
        tools_tokens,
        request_tokens,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_context::RoughTokenCounter;
    use std::sync::Arc;

    #[test]
    fn request_exceeds_messages_when_tools_present() {
        let policy = ContextPolicy::new(
            Arc::new(RoughTokenCounter::new(4)),
            drox_context::ContextBudget::default(),
            None,
        );
        let messages = vec![Message::user("abcd")];
        let tools = vec![ToolSpec {
            name: "shell".into(),
            description: "run".into(),
            parameters: serde_json::json!({"type": "object"}),
        }];
        let est = estimate_request_load(&policy, &messages, &tools, None);
        assert!(est.tools_tokens > 0);
        assert!(est.request_tokens > est.message_tokens);
    }
}