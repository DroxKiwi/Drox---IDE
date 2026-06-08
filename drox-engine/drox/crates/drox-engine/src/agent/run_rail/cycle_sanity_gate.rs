//! Restrict `cycle_sanity` observation to VERIFY when run rail is active.
//!
//! Without rail, behaviour is unchanged (`architect_state::observe_cycle_sanity_tool`).

use super::station::RunStation;

/// Tools that can resolve cycle sanity when observed.
const SANITY_TOOLS: &[&str] = &["bash", "delegate_executor", "ask_user_question"];

/// Whether `observe_cycle_sanity_tool` should run for this tool call.
#[must_use]
pub fn should_observe_cycle_sanity(
    rail_active: bool,
    station: RunStation,
    tool_name: &str,
) -> bool {
    if !rail_active {
        return true;
    }
    if station != RunStation::Verify {
        return false;
    }
    SANITY_TOOLS.contains(&tool_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rail_blocks_sanity_outside_verify() {
        assert!(!should_observe_cycle_sanity(
            true,
            RunStation::Read,
            "bash"
        ));
    }

    #[test]
    fn rail_allows_bash_at_verify() {
        assert!(should_observe_cycle_sanity(
            true,
            RunStation::Verify,
            "bash"
        ));
    }

    #[test]
    fn inactive_rail_preserves_legacy() {
        assert!(should_observe_cycle_sanity(
            false,
            RunStation::Read,
            "bash"
        ));
    }
}
