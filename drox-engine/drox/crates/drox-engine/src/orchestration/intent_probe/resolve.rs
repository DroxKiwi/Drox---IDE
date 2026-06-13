//! Map intent flags + RPC mode to [`GateChainResult`].

use super::flags::RunIntentFlags;
use crate::orchestration::{ArchitectGate, GateChainResult, StartRunKind};

/// Product auto routing (no RPC mode): greeting → discuss reply-only, else edit.
#[must_use]
pub fn gate_chain_for_auto(flags: &RunIntentFlags) -> GateChainResult {
    if flags.greeting_only {
        GateChainResult {
            gate: ArchitectGate::Discuss,
            start_run: StartRunKind::DiscussReplyOnly,
        }
    } else {
        GateChainResult {
            gate: ArchitectGate::Edit,
            start_run: StartRunKind::Edit,
        }
    }
}

/// RPC mode forces the gate; flags refine `start_run` for discuss.
#[must_use]
pub fn gate_chain_for_rpc(gate: ArchitectGate, flags: &RunIntentFlags) -> GateChainResult {
    let start_run = match gate {
        ArchitectGate::Discuss => {
            if flags.greeting_only {
                StartRunKind::DiscussReplyOnly
            } else {
                StartRunKind::DiscussWithReads
            }
        }
        ArchitectGate::Analyze => StartRunKind::Analyze,
        ArchitectGate::Edit => StartRunKind::Edit,
    };
    GateChainResult { gate, start_run }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::intent_probe::flags::ProbeSource;

    fn flags(greeting_only: bool) -> RunIntentFlags {
        RunIntentFlags {
            greeting_only,
            expects_workspace_mutation: !greeting_only,
            source: ProbeSource::Llm,
        }
    }

    #[test]
    fn auto_salut_routes_discuss_reply_only() {
        let chain = gate_chain_for_auto(&flags(true));
        assert_eq!(chain.gate, ArchitectGate::Discuss);
        assert_eq!(chain.start_run, StartRunKind::DiscussReplyOnly);
    }

    #[test]
    fn auto_edit_brief_routes_edit() {
        let chain = gate_chain_for_auto(&flags(false));
        assert_eq!(chain.gate, ArchitectGate::Edit);
        assert_eq!(chain.start_run, StartRunKind::Edit);
    }

    #[test]
    fn rpc_discussion_greeting_reply_only() {
        let chain = gate_chain_for_rpc(ArchitectGate::Discuss, &flags(true));
        assert_eq!(chain.start_run, StartRunKind::DiscussReplyOnly);
    }

    #[test]
    fn rpc_discussion_repo_question_with_reads() {
        let chain = gate_chain_for_rpc(ArchitectGate::Discuss, &flags(false));
        assert_eq!(chain.start_run, StartRunKind::DiscussWithReads);
    }
}
