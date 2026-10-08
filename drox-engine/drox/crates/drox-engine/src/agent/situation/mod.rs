//! Situation card — bloc system court réécrit avant chaque tour LLM (1.6.0 Vague 4 / S-1).
//!
//! Une seule carte par run (marqueur stable) : pas d'accumulation de messages
//! system. Sources = état déjà suivi dans `drive_inner`.
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`card`] | Snapshot + format + upsert dans l'historique |
//! | [`paths`] | Paths fichiers touchés / re-read `file_read` |
//! | [`todos`] | Indices todo depuis la sortie `todo_write` |
//! | [`task_outcome`] | Télémétrie Explore + filet parent heavy-read |

mod card;
mod paths;
mod task_outcome;
mod todos;

#[cfg(test)]
mod tests;

pub(crate) use card::{
	format_situation_card, upsert_situation_card, SituationSnapshot, SITUATION_CARD_MARKER,
};
pub(crate) use paths::{
	clear_rotating_file_read_window, note_rotating_file_read, note_successful_file_read,
	path_from_file_tool, rotating_file_read_should_nudge,
};
pub(crate) use task_outcome::{
	counts_as_parent_heavy_read, note_task_tool_success, task_outcome_telemetry,
};
pub(crate) use todos::{completed_todos_hint, first_in_progress_todo_id, next_todo_from_output};
