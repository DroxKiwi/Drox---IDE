//! Kind de run après routage discuss / edit (RPC ou auto → edit).

use super::architect_gate::ArchitectGate;
use super::routing::resolve_gate_chain;

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
    /// Auto routing — always architect edit.
    #[must_use]
    pub fn auto() -> Self {
        resolve_gate_chain(None)
    }

    /// RPC mode override.
    #[must_use]
    pub fn from_rpc(gate: ArchitectGate) -> Self {
        resolve_gate_chain(Some(gate))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_routes_edit() {
        let r = GateChainResult::auto();
        assert_eq!(r.gate, ArchitectGate::Edit);
        assert_eq!(r.start_run, StartRunKind::Edit);
    }

    #[test]
    fn rpc_discussion_with_reads() {
        let r = GateChainResult::from_rpc(ArchitectGate::Discuss);
        assert_eq!(r.gate, ArchitectGate::Discuss);
        assert_eq!(r.start_run, StartRunKind::DiscussWithReads);
    }

    #[test]
    fn rpc_analyze() {
        let r = GateChainResult::from_rpc(ArchitectGate::Analyze);
        assert_eq!(r.start_run, StartRunKind::Analyze);
    }

    #[test]
    fn rpc_edit_stays_edit() {
        let r = GateChainResult::from_rpc(ArchitectGate::Edit);
        assert_eq!(r.start_run, StartRunKind::Edit);
    }
}
