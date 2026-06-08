//! Per-run rail state (station, depth, counters) — separate from orchestration todos.
//!
//! Design: `drox-engine/docs/1.4/1.4.0/05-CODE-ARCHITECTURE.md`

use std::collections::HashSet;

use super::station::{RunDepth, RunStation};

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
    /// Tool calls executed at ACT in the parent (segment trigger C7).
    pub act_tool_steps: u32,
    /// Paths already delegated to a segment this run (avoid respawn loops).
    pub segment_spawned_paths: HashSet<String>,
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
            act_tool_steps: 0,
            segment_spawned_paths: HashSet::new(),
        }
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
