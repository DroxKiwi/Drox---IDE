//! Phase **compte rendu** — format du rapport parent (jamais le dump d'outils).

pub(super) const EXPLORE_SYNTH_NOTES_MAX_CHARS: usize = 10_000;

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
