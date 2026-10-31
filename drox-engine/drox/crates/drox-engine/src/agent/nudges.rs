//! Pont nudges : re-exports [`drox_prompts`] + wrapper ask (exemple JSON tools).
//!
//! Les détecteurs prose FR/EN ont été retirés (RULES §6) — intent-write = mécanique
//! `[phase: acting]` sans tool_calls dans `drive.rs`.

use drox_tools::CANONICAL_ASK_JSON_EXAMPLE;
use drox_types::{Content, Message, Role};

pub(crate) use drox_prompts::{
	context_load_nudge, explore_incomplete_nudge, run_objective_done_nudge,
	run_objective_system_block, step_by_step_todo_nudge, step_explore_kickoff_nudge,
	STEP_BY_STEP_HEADS_UP_PREFIX,
	step_skips_explore_kickoff,
	step_without_explore_nudge, STEP_EXPLORE_KICKOFF_PREFIX, STEP_WITHOUT_EXPLORE_PREFIX,
	unfinished_course_plan_prompt, unfinished_todos_prompt,
	ANALYZING_PHASE_NUDGE, CODE_MUTATION_TESTING_NUDGE, DOC_INGESTION_EXPLORE_ANNEX,
	DONE_ONLY_NUDGE_PROMPT, EXPLORE_RESCUE_PARENT_READ_NUDGE, INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT,
	INTENT_ONLY_WRITE_MAX_NUDGES, INTENT_ONLY_WRITE_NUDGE_PROMPT, LOOP_DETECTED_NUDGE_PROMPT,
	LOOP_FORCE_CONCLUDE_PROMPT, LOOP_TOOL_FAMILY_NUDGE_PROMPT,
	MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
	MISSING_ANSWERING_PROMPT, NUDGE_PROMPT, PARENT_HEAVY_READ_NUDGE,
	EXPLORE_ARTIFACT_READ_FAIL_NUDGE, EXPLORE_COVERED_REREAD_NUDGE, MICRO_ACT_WRITE_NUDGE,
	PARENT_HEAVY_READ_NUDGE_THRESHOLD, PARENT_HEAVY_READ_PREFIX, POST_ASK_ACTING_NUDGE, POST_EXPLORE_STALL_ACT_NUDGE,
	POST_EXPLORE_STALL_READ_THRESHOLD, POST_MERGE_CLOSURE_NUDGE,
	REPEATED_FILE_READ_NUDGE, REPEATED_FILE_READ_NUDGE_THRESHOLD, ROTATING_FILE_READ_NUDGE,
	ROTATING_FILE_READ_REINJECT_EVERY,
	STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD,
	WORK_PLAN_FRAME_NUDGE, WORK_WITHOUT_PLAN_NUDGE, WORK_WITHOUT_PLAN_NUDGE_THRESHOLD,
	WORK_WITHOUT_PLAN_PREFIX,
	LOCAL_EMPTY_TURN_NUDGE, LOCAL_EXPLORE_KICKOFF_NUDGE, LOCAL_FINAL_ANSWER_PROMPT,
	LOCAL_SOFT_CLOSE_CHECK_NUDGE, LOCAL_TEXTUAL_TOOL_NUDGE, LOCAL_TEXTUAL_TOOL_TOOLS_OFF_NUDGE,
	reply_has_textual_tool_call,
};

/// Wrapper : injecte l'exemple JSON canonique de `drox-tools` (évite cycle crates).
#[must_use]
pub(crate) fn ask_user_question_loop_nudge() -> String {
	drox_prompts::ask_user_question_loop_nudge(CANONICAL_ASK_JSON_EXAMPLE)
}

/// Retire les rappels « Heads-up: you've called … » déjà dans l'historique.
///
/// Chaque nouveau palier réécrit le même paragraphe avec d'autres chiffres.
/// Les anciennes copies restent lisibles par le modèle et se contredisent.
/// `local-9b` n'injecte pas ce rappel (`plan_nudges` est faux) : cet appel
/// n'est fait que sur `local-27b` et `cloud-full`.
pub(crate) fn drop_step_by_step_heads_up(messages: &mut Vec<Message>, cursor: &mut usize) {
	let mut index = 0;
	while index < messages.len() {
		if system_starts_with(&messages[index], STEP_BY_STEP_HEADS_UP_PREFIX) {
			messages.remove(index);
			if index < *cursor {
				*cursor = cursor.saturating_sub(1);
			}
		} else {
			index += 1;
		}
	}
}

/// Retire les kickoffs et rappels « sans explore » qui ne concernent plus l'étape ouverte.
///
/// `keep_current` est faux quand un `task` a déjà réussi pour cette étape :
/// le rappel « pas encore de task » serait faux. `local-9b` n'écrit pas ces
/// préfixes (`plan_nudges` est faux) ; son kickoff tour-0 reste en place.
pub(crate) fn drop_stale_step_explore_reminders(
	messages: &mut Vec<Message>,
	cursor: &mut usize,
	current_step_id: Option<&str>,
	keep_current: bool,
) {
	let mut index = 0;
	while index < messages.len() {
		let stale = system_explore_reminder_text(&messages[index]).is_some_and(|text| {
			match (keep_current, current_step_id) {
				(true, Some(step_id)) => !reminder_is_for_step(text, step_id),
				_ => true,
			}
		});
		if stale {
			messages.remove(index);
			if index < *cursor {
				*cursor = cursor.saturating_sub(1);
			}
		} else {
			index += 1;
		}
	}
}

fn system_explore_reminder_text(message: &Message) -> Option<&str> {
	if message.role != Role::System {
		return None;
	}
	message.content.iter().find_map(|block| match block {
		Content::Text { text }
			if text.starts_with(STEP_EXPLORE_KICKOFF_PREFIX)
				|| text.starts_with(STEP_WITHOUT_EXPLORE_PREFIX) =>
		{
			Some(text.as_str())
		}
		_ => None,
	})
}

fn reminder_is_for_step(text: &str, step_id: &str) -> bool {
	text.contains(&format!("Step `{step_id}` in_progress"))
}

pub(crate) fn drop_system_with_prefix(messages: &mut Vec<Message>, cursor: &mut usize, prefix: &str) {
	let mut index = 0;
	while index < messages.len() {
		if system_starts_with(&messages[index], prefix) {
			messages.remove(index);
			if index < *cursor {
				*cursor = cursor.saturating_sub(1);
			}
		} else {
			index += 1;
		}
	}
}

fn system_starts_with(message: &Message, prefix: &str) -> bool {
	message.role == Role::System
		&& message.content.iter().any(|block| {
			matches!(block, Content::Text { text } if text.starts_with(prefix))
		})
}

#[cfg(test)]
mod heads_up_tests {
	use super::drop_step_by_step_heads_up;
	use drox_types::Message;

	#[test]
	fn stacked_heads_up_are_removed_and_the_cursor_rewinds() {
		let mut messages = vec![
			Message::system("You are Drox."),
			Message::user("fais le travail"),
			Message::system("Heads-up: you've called 2 mutating tools since a."),
			Message::system("Heads-up: you've called 2 mutating tools since a."),
			Message::system("Heads-up: you've called 4 mutating tools since b."),
			Message::system("STEP KICKOFF — soft micro"),
		];
		let mut cursor = messages.len();
		drop_step_by_step_heads_up(&mut messages, &mut cursor);
		assert_eq!(messages.len(), 3);
		assert_eq!(cursor, 3);
		assert!(messages.iter().any(|message| {
			message.content.iter().any(|block| {
				matches!(block, drox_types::Content::Text { text } if text.starts_with("STEP KICKOFF"))
			})
		}));
		assert!(messages.iter().all(|message| {
			message.content.iter().all(|block| {
				!matches!(block, drox_types::Content::Text { text } if text.starts_with("Heads-up:"))
			})
		}));
	}

	#[test]
	fn finished_step_explore_reminders_are_removed() {
		use super::drop_stale_step_explore_reminders;
		let mut messages = vec![
			Message::system("You are Drox."),
			Message::system("STEP KICKOFF — soft micro\nStep `1` in_progress: lire"),
			Message::system("STEP WITHOUT EXPLORE — soft reminder\nStep `1` in_progress (lire): no task"),
			Message::system("STEP KICKOFF — soft micro\nStep `1b` in_progress: suite"),
			Message::system("STEP KICKOFF — soft micro\nStep `2` in_progress: compiler"),
			Message::user("continue"),
		];
		let mut cursor = messages.len();
		drop_stale_step_explore_reminders(&mut messages, &mut cursor, Some("2"), true);
		assert_eq!(messages.len(), 3);
		assert_eq!(cursor, 3);
		let left: Vec<String> = messages
			.iter()
			.flat_map(|message| message.content.iter())
			.filter_map(|block| match block {
				drox_types::Content::Text { text } => Some(text.clone()),
				_ => None,
			})
			.collect();
		assert!(left.iter().any(|text| text.contains("Step `2`")));
		assert!(left.iter().all(|text| !text.contains("Step `1`")));
	}

	#[test]
	fn stale_plan_and_heavy_read_reminders_are_removed() {
		use super::{drop_system_with_prefix, PARENT_HEAVY_READ_PREFIX, WORK_WITHOUT_PLAN_PREFIX};
		let mut messages = vec![
			Message::system("You are Drox."),
			Message::system("WORK WITHOUT PLAN — soft reminder\nno todo_write yet"),
			Message::system("STOP flooding the parent with repeated reads."),
			Message::user("continue"),
		];
		let mut cursor = messages.len();
		drop_system_with_prefix(&mut messages, &mut cursor, WORK_WITHOUT_PLAN_PREFIX);
		drop_system_with_prefix(&mut messages, &mut cursor, PARENT_HEAVY_READ_PREFIX);
		assert_eq!(messages.len(), 2);
		assert_eq!(cursor, 2);
	}
}
