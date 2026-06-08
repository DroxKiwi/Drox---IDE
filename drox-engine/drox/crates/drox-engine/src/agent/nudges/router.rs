//! Routage du nudge par `RoleId`.

use crate::run_spec::{RoleId, RunSpec};

use super::architect::{
    ARCHITECT_DISCUSSION_NUDGE_PROMPT, ARCHITECT_DONE_ONLY_NUDGE_PROMPT, ARCHITECT_NUDGE_PROMPT,
    ARCHITECT_NUDGE_SOLO_PROMPT,
};
use super::executor::{EXECUTOR_DONE_ONLY_NUDGE_PROMPT, EXECUTOR_NUDGE_PROMPT};
use super::standard::{DONE_ONLY_NUDGE_PROMPT, NUDGE_PROMPT};

#[must_use]
pub(crate) fn nudge_prompt(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::Architect => {
            if spec.executor_delegation_enabled {
                ARCHITECT_NUDGE_PROMPT
            } else {
                ARCHITECT_NUDGE_SOLO_PROMPT
            }
        }
        RoleId::ArchitectDiscussion => ARCHITECT_DISCUSSION_NUDGE_PROMPT,
        RoleId::Executor => EXECUTOR_NUDGE_PROMPT,
        RoleId::Standard => NUDGE_PROMPT,
    }
}

#[must_use]
pub(crate) fn done_only_nudge_prompt(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::Architect => ARCHITECT_DONE_ONLY_NUDGE_PROMPT,
        RoleId::ArchitectDiscussion => ARCHITECT_DISCUSSION_NUDGE_PROMPT,
        RoleId::Executor => EXECUTOR_DONE_ONLY_NUDGE_PROMPT,
        RoleId::Standard => DONE_ONLY_NUDGE_PROMPT,
    }
}
