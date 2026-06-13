//! Kind de run après routage discuss / edit (RPC ou intent probe).

use super::ArchitectGate;
use super::intent_probe::{gate_chain_for_auto, gate_chain_for_rpc, RunIntentFlags};

/// Kind de run architecte après résolution du mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartRunKind {
    DiscussWithReads,
    DiscussReplyOnly,
    /// Exploration lecture seule — pas de plan / delegate.
    Analyze,
    Edit,
}

impl StartRunKind {
    #[must_use]
    pub const fn wire_id(self) -> &'static str {
        match self {
            Self::DiscussWithReads => "discuss_with_reads",
            Self::DiscussReplyOnly => "discuss_reply_only",
            Self::Analyze => "analyze",
            Self::Edit => "edit",
        }
    }

    #[must_use]
    pub fn architect_gate(self) -> ArchitectGate {
        match self {
            Self::DiscussWithReads | Self::DiscussReplyOnly => ArchitectGate::Discuss,
            Self::Analyze => ArchitectGate::Analyze,
            Self::Edit => ArchitectGate::Edit,
        }
    }

    #[must_use]
    pub const fn allows_discussion_reads(self) -> bool {
        matches!(self, Self::DiscussWithReads | Self::Analyze)
    }
}

/// Résultat du routage pré-run (discuss vs edit + variante).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GateChainResult {
    pub gate: ArchitectGate,
    pub start_run: StartRunKind,
}

impl GateChainResult {
    /// Auto routing from intent probe flags.
    #[must_use]
    pub fn from_auto_intent(flags: &RunIntentFlags) -> Self {
        gate_chain_for_auto(flags)
    }

    /// RPC override + intent flags for discuss refinement.
    #[must_use]
    pub fn from_rpc_intent(gate: ArchitectGate, flags: &RunIntentFlags) -> Self {
        gate_chain_for_rpc(gate, flags)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::intent_probe::ProbeSource;

    fn greeting_flags() -> RunIntentFlags {
        RunIntentFlags::from_llm(true, false)
    }

    fn work_flags() -> RunIntentFlags {
        RunIntentFlags::from_llm(false, true)
    }

    #[test]
    fn auto_routes_greeting_to_discuss_reply_only() {
        let r = GateChainResult::from_auto_intent(&greeting_flags());
        assert_eq!(r.gate, ArchitectGate::Discuss);
        assert_eq!(r.start_run, StartRunKind::DiscussReplyOnly);
    }

    #[test]
    fn auto_routes_work_to_edit() {
        let r = GateChainResult::from_auto_intent(&work_flags());
        assert_eq!(r.gate, ArchitectGate::Edit);
        assert_eq!(r.start_run, StartRunKind::Edit);
    }

    #[test]
    fn rpc_discussion_greeting_reply_only() {
        let r = GateChainResult::from_rpc_intent(ArchitectGate::Discuss, &greeting_flags());
        assert_eq!(r.start_run, StartRunKind::DiscussReplyOnly);
    }

    #[test]
    fn rpc_discussion_repo_question_with_reads() {
        let flags = RunIntentFlags {
            greeting_only: false,
            expects_workspace_mutation: false,
            source: ProbeSource::Llm,
        };
        let r = GateChainResult::from_rpc_intent(ArchitectGate::Discuss, &flags);
        assert_eq!(r.start_run, StartRunKind::DiscussWithReads);
    }

    #[test]
    fn rpc_edit_stays_edit() {
        let r = GateChainResult::from_rpc_intent(ArchitectGate::Edit, &work_flags());
        assert_eq!(r.start_run, StartRunKind::Edit);
    }

    /// Smoke `ses_3eb8a6d5` — compound plan + mutation brief must not route to discuss reply-only.
    #[test]
    fn auto_compound_plan_mutation_brief_routes_edit() {
        let flags = RunIntentFlags {
            greeting_only: false,
            expects_workspace_mutation: true,
            source: ProbeSource::Llm,
        };
        let r = GateChainResult::from_auto_intent(&flags);
        assert_eq!(r.gate, ArchitectGate::Edit);
        assert_eq!(r.start_run, StartRunKind::Edit);
    }
}
