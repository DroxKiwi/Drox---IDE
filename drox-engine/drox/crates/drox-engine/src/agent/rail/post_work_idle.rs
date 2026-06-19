//! Post-work idle counter reset (observational rail — no stall nudges).

use super::state::RunRailState;

/// Reset counter after a visible answering phase or a new mutation.
pub fn reset_post_work_idle(state: &mut RunRailState) {
    state.post_todos_idle_turns = 0;
}
