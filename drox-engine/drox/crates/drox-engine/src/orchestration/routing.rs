//! Static architect gate routing — no boot LLM probe.

use super::architect_gate::ArchitectGate;
use super::start_run::{GateChainResult, StartRunKind};

/// Resolve discuss / edit / analyze from RPC mode only.
///
/// Auto (`None`) always routes to architect edit with full workspace tools.
#[must_use]
pub fn resolve_gate_chain(rpc_gate: Option<ArchitectGate>) -> GateChainResult {
    match rpc_gate {
        None | Some(ArchitectGate::Edit) => GateChainResult {
            gate: ArchitectGate::Edit,
            start_run: StartRunKind::Edit,
        },
        Some(ArchitectGate::Discuss) => GateChainResult {
            gate: ArchitectGate::Discuss,
            start_run: StartRunKind::DiscussWithReads,
        },
        Some(ArchitectGate::Analyze) => GateChainResult {
            gate: ArchitectGate::Analyze,
            start_run: StartRunKind::Analyze,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_routes_edit() {
        let chain = resolve_gate_chain(None);
        assert_eq!(chain.gate, ArchitectGate::Edit);
        assert_eq!(chain.start_run, StartRunKind::Edit);
    }

    #[test]
    fn rpc_discuss_with_reads() {
        let chain = resolve_gate_chain(Some(ArchitectGate::Discuss));
        assert_eq!(chain.gate, ArchitectGate::Discuss);
        assert_eq!(chain.start_run, StartRunKind::DiscussWithReads);
    }

    #[test]
    fn rpc_analyze() {
        let chain = resolve_gate_chain(Some(ArchitectGate::Analyze));
        assert_eq!(chain.gate, ArchitectGate::Analyze);
        assert_eq!(chain.start_run, StartRunKind::Analyze);
    }

    #[test]
    fn rpc_edit() {
        let chain = resolve_gate_chain(Some(ArchitectGate::Edit));
        assert_eq!(chain.gate, ArchitectGate::Edit);
        assert_eq!(chain.start_run, StartRunKind::Edit);
    }
}
