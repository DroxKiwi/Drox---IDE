//! Carte situation injectée / remplacée dans l'historique messages.

use drox_types::{Content, Message, Role};

/// Préfixe stable pour retrouver / remplacer la carte (ne pas traduire).
pub(crate) const SITUATION_CARD_MARKER: &str = "# Run situation (engine)";

/// État affiché dans la situation card.
#[derive(Debug, Clone, Default)]
pub(crate) struct SituationSnapshot {
	pub objective: Option<String>,
	pub todos_pending: u64,
	pub todos_in_progress: u64,
	pub todos_completed_hint: u64,
	pub next_todo: Option<String>,
	pub files_touched: Vec<String>,
	pub last_tool_error: Option<String>,
	pub permission_mode: Option<String>,
}

/// Rend le markdown de la carte (déterministe, court).
#[must_use]
pub(crate) fn format_situation_card(snap: &SituationSnapshot) -> String {
	let objective = snap
		.objective
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or("(none locked)");
	let open = snap.todos_pending.saturating_add(snap.todos_in_progress);
	let next = snap
		.next_todo
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or("(none)");
	let files = if snap.files_touched.is_empty() {
		"(none yet)".to_string()
	} else {
		snap.files_touched
			.iter()
			.take(12)
			.cloned()
			.collect::<Vec<_>>()
			.join(", ")
	};
	let err = snap
		.last_tool_error
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or("none");
	let mode = snap.permission_mode.as_deref().unwrap_or("default");

	format!(
		"{SITUATION_CARD_MARKER}\n\
         - objective: {objective}\n\
         - todos: {open} open ({pending} pending / {in_prog} in_progress) · ~{done} completed — next: {next}\n\
         - files_touched: {files}\n\
         - last_tool_error: {err}\n\
         - permission_mode: {mode}\n\
         - context_note: prefer re-read paths above; do not re-dump large files via bash Get-Content/cat",
		pending = snap.todos_pending,
		in_prog = snap.todos_in_progress,
		done = snap.todos_completed_hint,
	)
}

/// Insère ou remplace la situation card dans `messages`.
///
/// - Si une carte existe déjà (marqueur), remplace son texte **en place**.
/// - Sinon, l'insère à l'index `insert_at` (typiquement après system prompt +
///   objectif verrouillé).
///
/// Retourne `true` si une **nouvelle** carte a été insérée (compteur
/// `leading_injected_systems` à incrémenter).
pub(crate) fn upsert_situation_card(
	messages: &mut Vec<Message>,
	snap: &SituationSnapshot,
	insert_at: usize,
) -> bool {
	let body = format_situation_card(snap);
	if let Some(idx) = find_situation_card_index(messages) {
		messages[idx] = Message::system(body);
		return false;
	}
	let at = insert_at.min(messages.len());
	messages.insert(at, Message::system(body));
	true
}

#[must_use]
pub(crate) fn find_situation_card_index(messages: &[Message]) -> Option<usize> {
	messages.iter().position(|m| {
		m.role == Role::System
			&& m.content.iter().any(|c| match c {
				Content::Text { text } => text.starts_with(SITUATION_CARD_MARKER),
				_ => false,
			})
	})
}
