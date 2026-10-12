//! Phase **compte rendu** — format du rapport parent (jamais le dump d'outils).
//!
//! C5 / V5-d → C5b : phase 2 = **notes télégraphiques + contrat JSON** seulement
//! (zéro description parent, zéro activity tools).

/// Plafond notes injectées au synth (après filtre télégraphique).
pub(super) const EXPLORE_SYNTH_NOTES_MAX_CHARS: usize = 3_000;

/// Max lignes de notes gardées pour le synth.
pub(super) const EXPLORE_SYNTH_NOTES_MAX_LINES: usize = 40;

/// Longueur max d'une ligne « fait » (sinon essay sans path → drop).
pub(super) const EXPLORE_SYNTH_FACT_LINE_MAX_CHARS: usize = 160;

pub(super) fn truncate_chars(s: &str, max: usize) -> String {
	if s.len() <= max {
		return s.to_string();
	}
	let start = s.len().saturating_sub(max);
	let mut slice = &s[start..];
	if let Some(i) = slice.find('\n') {
		slice = &slice[i + 1..];
	}
	format!("…\n{slice}")
}

/// Signal minimal « chemin / fichier » (évite faux positifs type `Next.js`).
fn line_has_path_signal(lower: &str) -> bool {
	if lower.contains("src/")
		|| lower.contains("docs/")
		|| lower.contains("content/")
		|| lower.contains('\\')
		|| lower.contains("`/")
	{
		return true;
	}
	for raw in lower.split(|c: char| {
		c.is_whitespace() || matches!(c, '`' | ',' | ')' | '(' | '[' | ']' | '"' | '\'')
	}) {
		let t = raw.trim_matches(|c| matches!(c, '-' | '*' | '—' | '–' | ':' | ';'));
		if t.contains('/') || t.contains('\\') {
			return true;
		}
		for ext in [".tsx", ".ts", ".jsx", ".js", ".md", ".rs", ".json"] {
			if let Some(stem) = t.strip_suffix(ext) {
				// Ignore product names like `next.js`.
				if stem.len() >= 2 && !stem.eq_ignore_ascii_case("next") {
					return true;
				}
			}
		}
	}
	false
}

/// Prépare les notes phase 1 pour le tour rapport : clôture + télégraphique (paths + 1 fait).
#[must_use]
pub(super) fn prepare_synth_notes(draft: &str) -> String {
	let raw = draft.trim();
	if raw.is_empty() {
		return String::new();
	}
	// Préférer le texte après le dernier marqueur answering / done (clôture phase 1).
	let after_close = raw
		.rfind("[phase: answering]")
		.or_else(|| raw.rfind("[phase: done]"))
		.map(|i| {
			let rest = &raw[i..];
			rest.lines()
				.skip(1)
				.collect::<Vec<_>>()
				.join("\n")
				.trim()
				.to_string()
		})
		.filter(|s| !s.is_empty());
	let base = after_close.as_deref().unwrap_or(raw);
	let telegraphic: Vec<&str> = base
		.lines()
		.filter(|line| is_telegraphic_fact_line(line))
		.collect();
	let use_lines: Vec<&str> = if telegraphic.len() >= 2 {
		telegraphic
	} else {
		// Fallback : au moins retirer le CoT évident.
		base.lines()
			.filter(|line| !is_synth_noise_line(line))
			.collect()
	};
	let capped: Vec<&str> = use_lines
		.into_iter()
		.take(EXPLORE_SYNTH_NOTES_MAX_LINES)
		.collect();
	let joined = capped.join("\n");
	let cleaned = joined.trim();
	if cleaned.is_empty() {
		return String::new();
	}
	truncate_chars(cleaned, EXPLORE_SYNTH_NOTES_MAX_CHARS)
}

fn is_telegraphic_fact_line(line: &str) -> bool {
	let t = line.trim();
	if t.is_empty() {
		return false;
	}
	if is_synth_noise_line(line) {
		return false;
	}
	let lower = t.to_ascii_lowercase();
	let has_path = line_has_path_signal(&lower);
	let n = t.chars().count();
	if has_path && n <= EXPLORE_SYNTH_FACT_LINE_MAX_CHARS {
		return true;
	}
	// Puces courtes sans path (gaps / counts) — OK si très courtes.
	if (t.starts_with('-') || t.starts_with('*')) && n <= 100 {
		return true;
	}
	// Essay / plan sans path → drop.
	if !has_path && n > 80 {
		return false;
	}
	has_path || n <= 80
}

fn is_synth_noise_line(line: &str) -> bool {
	let t = line.trim();
	if t.is_empty() {
		return false;
	}
	if t.starts_with("[phase:") && t.ends_with(']') {
		return true;
	}
	let lower = t.to_ascii_lowercase();
	const NOISE: &[&str] = &[
		"let me ",
		"i should ",
		"i need to ",
		"i'll ",
		"i will ",
		"now i ",
		"wait —",
		"wait,",
		"hmm",
		"actually,",
		"the task:",
		"the return contract",
		"write only the",
		"no tool calls",
		"caps:",
		"## return contract",
		"## task brief",
		"must include:",
		"for file_summaries",
		"keep it concise",
		"no preamble",
	];
	if NOISE.iter().any(|p| lower.starts_with(p)) {
		return true;
	}
	const META_HEADERS: &[&str] = &[
		"## return contract",
		"## task brief",
		"## key_symbols",
		"## file_summaries",
		"## paths_read",
		"## gaps",
	];
	META_HEADERS.iter().any(|h| lower.contains(h))
}

pub(super) fn strip_phase_markers(text: &str) -> String {
	text.lines()
		.filter(|line| {
			let t = line.trim();
			!(t.starts_with("[phase:") && t.ends_with(']'))
		})
		.collect::<Vec<_>>()
		.join("\n")
		.trim()
		.to_string()
}

/// True when the assistant text already looks like a parent-usable report.
#[cfg(test)]
#[must_use]
pub(super) fn looks_like_structured_report(text: &str) -> bool {
	let lower = text.to_ascii_lowercase();
	lower.contains("## findings")
		|| lower.contains("## paths")
		|| (lower.contains("findings") && lower.contains("recommended next"))
}

/// Rapport parent : synthèse structurée uniquement — jamais le dump d'activity tools.
pub(super) fn parent_facing_report(body: &str, hit_max: bool) -> String {
	let trimmed = body.trim();
	if trimmed.is_empty() {
		return if hit_max {
			"## Findings\n(Explore hit its iteration ceiling without producing usable notes.)\n\n\
## Paths\n(none)\n\n\
## Gaps\nIncomplete exploration.\n\n\
## Recommended next parent steps\n- Spawn a narrower Explore focused on one subtree."
				.into()
		} else {
			"(Sous-agent Explore terminé sans texte — vérifiez les logs ou relancez avec une description plus précise.)"
				.into()
		};
	}
	let mut out = trimmed.to_string();
	if hit_max {
		out.push_str(
			"\n\n---\n*(Explore execution hit iteration ceiling — report phase distilled available evidence.)*",
		);
	}
	out
}

pub(super) fn fallback_incomplete_report(draft: &str, hit_max: bool) -> String {
	let notes = truncate_chars(draft.trim(), 2_500);
	let gap = if hit_max {
		"Iteration ceiling reached before a clean structured report."
	} else {
		"Explore ended without a usable report turn."
	};
	let body = if notes.is_empty() {
		format!(
			"## Findings\n(No usable notes captured.)\n\n## Paths\n(none)\n\n## Gaps\n{gap}\n\n\
## Recommended next parent steps\n- Re-run Explore with a tighter path/question scope."
		)
	} else {
		format!(
			"## Findings\n(Partial — report-phase synthesis failed; raw notes below.)\n\n{notes}\n\n\
## Gaps\n{gap}\n\n\
## Recommended next parent steps\n- Re-run a narrower Explore, or verify the paths mentioned above."
		)
	};
	parent_facing_report(&body, hit_max)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn prepare_prefers_answering_tail_and_drops_cot() {
		let draft = "\
Let me explore the tree first.\n\
I should glob everything.\n\
[phase: answering]\n\
- docs/pedagogie/01-contact-ollama.md (~600 lines)\n\
- docs/pedagogie/README.md hub\n\
[phase: done]\n";
		let notes = prepare_synth_notes(draft);
		assert!(notes.contains("01-contact-ollama.md"));
		assert!(!notes.to_ascii_lowercase().contains("let me explore"));
		assert!(!notes.contains("[phase:"));
	}

	#[test]
	fn prepare_drops_essay_keeps_path_bullets() {
		let draft = "\
[phase: answering]\n\
The site uses a Next.js app router and I should carefully map every module before writing.\n\
- src/app/docs/DocsSidebar.tsx — shared sidebar\n\
- src/app/docs/layout.tsx wraps children\n\
Caps: maxFiles 30 — Let me draft the file_summaries section next.\n";
		let notes = prepare_synth_notes(draft);
		assert!(notes.contains("DocsSidebar.tsx"));
		assert!(notes.contains("layout.tsx"));
		assert!(!notes.to_ascii_lowercase().contains("let me draft"));
		assert!(!notes.contains("carefully map every module"));
	}

}
