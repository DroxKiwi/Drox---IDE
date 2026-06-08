//! Per-run rail state (station, depth, counters) — separate from orchestration todos.

use super::station::{RunDepth, RunStation};

/// Mutable rail state for one architect edit run.
#[derive(Debug, Clone)]
pub struct RunRailState {
    pub station: RunStation,
    pub depth: RunDepth,
    /// Reserved — circuit breaker / segment counters (Phase 2+).
    pub act_failure_strikes: u32,
}

impl RunRailState {
    #[must_use]
    pub fn new() -> Self {
        Self {
            station: RunStation::BOOT,
            depth: RunDepth::Short,
            act_failure_strikes: 0,
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
