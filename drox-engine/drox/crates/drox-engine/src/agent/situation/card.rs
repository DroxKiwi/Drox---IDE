//! Carte situation injectée / remplacée dans l'historique messages (C4 / V4).
//!
//! Budget strict : **jauge + next + 1 contrainte** — pas de listing files / tools,
//! pas de protocole Explore (reste en A / Prefer dédiés).

use drox_types::{Content, Message, Role};

/// Préfixe stable pour retrouver / remplacer la carte (ne pas traduire).
pub(crate) const SITUATION_CARD_MARKER: &str = "# Run situation (engine)";

/// Lignes max hors marqueur (C4) : gauge / next / constraint.
pub(crate) const SITUATION_CARD_BODY_LINES: usize = 3;

const MAX_OBJECTIVE_CHARS: usize = 72;
const MAX_NEXT_CHARS: usize = 96;
const MAX_CONSTRAINT_CHARS: usize = 120;

/// État affiché dans la situation card.
#[derive(Debug, Clone, Default)]
pub(crate) struct SituationSnapshot {
	pub objective: Option<String>,
	pub todos_pending: u64,
	pub todos_in_progress: u64,
	pub todos_completed_hint: u64,
	pub next_todo: Option<String>,
	/// Conservé pour télémétrie / futurs usages — **non injecté** dans la card (V4-c).
	#[allow(dead_code)]
	pub files_touched: Vec<String>,
	pub last_tool_error: Option<String>,
	pub permission_mode: Option<String>,
}

/// Rend le markdown de la carte (déterministe, borné).
#[must_use]
pub(crate) fn format_situation_card(snap: &SituationSnapshot) -> String {
	let open = snap.todos_pending.saturating_add(snap.todos_in_progress);
	let mode = snap.permission_mode.as_deref().unwrap_or("default");
	let obj = snap
		.objective
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(|s| clamp_field(s, MAX_OBJECTIVE_CHARS))
		.unwrap_or_else(|| "(none)".into());
	let next = snap
		.next_todo
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(|s| clamp_field(s, MAX_NEXT_CHARS))
		.unwrap_or_else(|| "(none)".into());
	let constraint = constraint_line(snap);

	format!(
		"{SITUATION_CARD_MARKER}\n\
         - gauge: {open} open ({pending}p/{in_prog}i) · ~{done} done · mode={mode} · obj: {obj}\n\
         - next: {next}\n\
         - constraint: {constraint}\n",
		pending = snap.todos_pending,
		in_prog = snap.todos_in_progress,
		done = snap.todos_completed_hint,
	)
}

fn constraint_line(snap: &SituationSnapshot) -> String {
	if let Some(err) = snap
		.last_tool_error
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
	{
		return clamp_field(&format!("last_tool_error: {err}"), MAX_CONSTRAINT_CHARS);
	}
	// Une seule contrainte produit (pas de protocole Explore, pas de dump files).
	clamp_field(
		"prefer known paths / artefacts; do not re-dump large files via bash Get-Content/cat",
		MAX_CONSTRAINT_CHARS,
	)
}

fn clamp_field(s: &str, max_chars: usize) -> String {
	let t = s.trim();
	if t.chars().count() <= max_chars {
		return t.to_string();
	}
	let clipped: String = t.chars().take(max_chars.saturating_sub(1)).collect();
	format!("{clipped}…")
}

/// Nombre de lignes du corps (hors marqueur) — pour tests / dogfood.
#[must_use]
pub(crate) fn situation_card_body_line_count(card: &str) -> usize {
	card.lines()
		.skip(1)
		.filter(|l| !l.trim().is_empty())
		.count()
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
