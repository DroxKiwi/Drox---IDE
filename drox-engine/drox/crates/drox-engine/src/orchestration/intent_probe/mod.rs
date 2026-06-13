//! Boot-only intent probe — replaces NL keyword heuristics on user messages.

mod flags;
mod parse;
mod prompt;
mod resolve;
mod runner;

pub use flags::{ProbeSource, RunIntentFlags};
pub use parse::parse_run_intent_json;
pub use resolve::{gate_chain_for_auto, gate_chain_for_rpc};
pub use runner::run_intent_probe;

use std::sync::Arc;

use drox_llm::LlmClient;

use crate::orchestration::ArchitectGate;

/// Resolved routing after probe (or RPC defaults).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolvedRunIntent {
    pub flags: RunIntentFlags,
    pub rpc_gate: Option<ArchitectGate>,
}

impl ResolvedRunIntent {
    #[must_use]
    pub fn gate_chain(&self) -> crate::orchestration::GateChainResult {
        match self.rpc_gate {
            None => gate_chain_for_auto(&self.flags),
            Some(gate) => gate_chain_for_rpc(gate, &self.flags),
        }
    }
}

/// Resolve flags: probe when auto or `discussion` RPC; skip for `edit` / `analyze`.
pub async fn resolve_run_intent(
    llm: Arc<dyn LlmClient>,
    user_prompt: &str,
    rpc_gate: Option<ArchitectGate>,
) -> ResolvedRunIntent {
    let flags = match rpc_gate {
        Some(ArchitectGate::Edit) => RunIntentFlags::rpc_edit_default(),
        Some(ArchitectGate::Analyze) => RunIntentFlags::rpc_analyze_default(),
        Some(ArchitectGate::Discuss) | None => run_intent_probe(llm, user_prompt).await,
    };
    ResolvedRunIntent { flags, rpc_gate }
}
