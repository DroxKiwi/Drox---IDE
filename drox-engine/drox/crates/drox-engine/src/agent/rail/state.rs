//! Per-run rail state (station, depth, counters) — separate from orchestration todos.
//!
//! Design: `drox-engine/docs/1.4/archive/1.4.0/05-CODE-ARCHITECTURE.md`

use super::station::{RunDepth, RunStation};
use super::verify::VerifyOutcome;

/// Mutable rail state for one architect edit run.
#[derive(Debug, Clone)]
pub struct RunRailState {
    pub station: RunStation,
    pub depth: RunDepth,
    /// C4 — advance to PLAN blocked until the next user message at PROPOSE.
    pub propose_awaiting_user: bool,
    /// C6 — consecutive failures on the same path at ACT.
    pub act_failure_strikes: u32,
    pub act_failure_last_path: Option<String>,
    /// C14 — VERIFY visited (substitute for `[phase: testing]` before done).
    pub visited_verify: bool,
    /// Phase 4 — consecutive assistant turns at ACT without a mutation tool call.
    pub act_idle_turns: u32,
    /// Last verify result at station VERIFY (`bash` / `lsp` diagnostics).
    pub verify_outcome: VerifyOutcome,
}

impl RunRailState {
    #[must_use]
    pub fn new() -> Self {
        Self {
            station: RunStation::BOOT,
            depth: RunDepth::Short,
            propose_awaiting_user: false,
            act_failure_strikes: 0,
            act_failure_last_path: None,
            visited_verify: false,
            act_idle_turns: 0,
            verify_outcome: VerifyOutcome::Unknown,
        }
    }

    /// Ordinal index on the canonical station line (for auto-advance comparisons).
    #[must_use]
    pub fn station_ord(station: RunStation) -> usize {
        RunStation::ORDER
            .iter()
            .position(|s| *s == station)
            .unwrap_or(0)
    }

    /// Next candidate station (mode A). `None` when already at `Answer`.
    #[must_use]
    pub fn next_candidate_mode_a(&self) -> Option<RunStation> {
        self.station.next_mode_a(self.depth)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boot_station_is_intent_with_read_candidate() {
        let rail = RunRailState::new();
        assert_eq!(rail.station, RunStation::Intent);
        assert_eq!(rail.next_candidate_mode_a(), Some(RunStation::Read));
    }
}

