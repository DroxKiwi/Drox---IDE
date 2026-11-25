//! Point d'injection unique avant chaque requête LLM (sémantique Cline `prepareTurn`).

pub use crate::agent::run::shrink_phase::PrepareShrinkOutcome;

mod request_load;

pub use request_load::{RequestLoadEstimate, estimate_request_load};

use crate::context_policy::ContextPolicy;
use drox_context::{ContextBudget, WarningState};
use drox_llm::ToolSpec;
use drox_types::Message;

/// Facteur max entre estimateur et tokens provider du tour précédent (budget Cline).
pub const MAX_INPUT_UNDERESTIMATE_FACTOR: usize = 4;

/// Charge contexte d'un tour : estimation requête + budget de décision ajusté.
#[derive(Debug, Clone)]
pub struct TurnContextLoad {
    pub estimate: RequestLoadEstimate,
    pub underestimate_factor: usize,
    pub adjusted_effective_cap: usize,
    pub decision_budget: ContextBudget,
}

impl TurnContextLoad {
    #[must_use]
    pub fn warning_state(&self) -> WarningState {
        self.decision_budget.evaluate(self.estimate.request_tokens)
    }
}

/// Facteur par lequel le budget effectif est réduit quand le provider surestime l'estimateur.
#[must_use]
pub fn input_underestimate_factor(previous_provider_input: usize, request_tokens: usize) -> usize {
    if previous_provider_input == 0 || request_tokens == 0 {
        return 1;
    }
    previous_provider_input
        .div_ceil(request_tokens)
        .clamp(1, MAX_INPUT_UNDERESTIMATE_FACTOR)
}

/// Fenêtre effective ajustée (`raw / factor`), au moins 1 token.
#[must_use]
pub fn adjusted_effective_cap(
    raw_effective_window: usize,
    request_tokens: usize,
    previous_provider_input: usize,
) -> usize {
    let factor = input_underestimate_factor(previous_provider_input, request_tokens);
    (raw_effective_window / factor).max(1)
}

#[must_use]
fn decision_budget_for_cap(base: &ContextBudget, adjusted_effective_cap: usize) -> ContextBudget {
    ContextBudget::from_user_window(
        adjusted_effective_cap.saturating_add(base.reserved_output),
        base.reserved_output,
    )
}

/// Charge complète pour décisions snip / compaction (seuils 90 % / 97 % sur `request_tokens`).
#[must_use]
pub fn load_turn_context(
    policy: &ContextPolicy,
    messages_for_model: &[Message],
    tool_specs: &[ToolSpec],
    extra_system_chars: Option<&str>,
    previous_provider_input: usize,
) -> TurnContextLoad {
    let estimate =
        estimate_request_load(policy, messages_for_model, tool_specs, extra_system_chars);
    let underestimate_factor =
        input_underestimate_factor(previous_provider_input, estimate.request_tokens);
    let raw = policy.budget().effective_window();
    let adjusted_effective_cap =
        adjusted_effective_cap(raw, estimate.request_tokens, previous_provider_input);
    let decision_budget = decision_budget_for_cap(policy.budget(), adjusted_effective_cap);
    TurnContextLoad {
        estimate,
        underestimate_factor,
        adjusted_effective_cap,
        decision_budget,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context_policy::ContextPolicy;

    #[test]
    fn underestimate_factor_caps_at_four() {
        assert_eq!(input_underestimate_factor(40_000, 10_000), 4);
        assert_eq!(input_underestimate_factor(9_000, 10_000), 1);
        assert_eq!(input_underestimate_factor(0, 10_000), 1);
    }

    #[test]
    fn adjusted_cap_divides_by_factor() {
        let cap = adjusted_effective_cap(36_000, 10_000, 40_000);
        assert_eq!(cap, 9_000);
    }

    #[test]
    fn large_provider_triggers_autocompact_on_request_not_messages_alone() {
        let policy = ContextPolicy::for_model_context_window(32_768);
        let messages = vec![Message::user("short")];
        let mut tools = Vec::new();
        for i in 0..120 {
            tools.push(ToolSpec {
                name: format!("tool_{i}"),
                description: "x".repeat(400),
                parameters: serde_json::json!({"type": "object", "properties": {}}),
            });
        }
        let load = load_turn_context(&policy, &messages, &tools, None, 45_000);
        assert!(load.estimate.request_tokens > load.estimate.message_tokens);
        assert!(load.warning_state().above_autocompact);
    }
}