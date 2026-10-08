//! Progress live UI (carte Explore) — **pas** le payload parent.

use std::time::{Duration, Instant};

use drox_tools::{ShellProgressUpdate, ToolContext};

pub(super) const EXPLORE_PROGRESS_INTERVAL: Duration = Duration::from_millis(150);
const EXPLORE_PROGRESS_TAIL_LINES: usize = 48;
const EXPLORE_LIVE_REPORT_MAX_CHARS: usize = 900;

/// Une ligne d'activité tool pour la carte live (`→ glob …`).
pub(super) fn tool_activity_line(name: &str, arguments: &serde_json::Value) -> String {
	let detail = match name {
		"file_read" => arguments
			.get("path")
			.and_then(|v| v.as_str())
			.map(|s| s.trim().to_string()),
		"glob" => arguments
			.get("pattern")
			.and_then(|v| v.as_str())
			.map(|s| s.trim().to_string()),
		"grep" => {
			let pat = arguments
				.get("pattern")
				.and_then(|v| v.as_str())
				.unwrap_or("")
				.trim();
			let path = arguments
				.get("path")
				.and_then(|v| v.as_str())
				.unwrap_or("")
				.trim();
			if pat.is_empty() {
				None
			} else if path.is_empty() {
				Some(pat.to_string())
			} else {
				Some(format!("{pat} @ {path}"))
			}
		}
		"lsp" => arguments
			.get("query")
			.or_else(|| arguments.get("symbol"))
			.or_else(|| arguments.get("path"))
			.and_then(|v| v.as_str())
			.map(|s| s.trim().to_string()),
		"web_search" | "web_fetch" => arguments
			.get("query")
			.or_else(|| arguments.get("url"))
			.and_then(|v| v.as_str())
			.map(|s| s.trim().to_string()),
		"workspace_map_read" => Some("workspace map".into()),
		_ => None,
	};
	match detail {
		Some(d) if !d.is_empty() => format!("→ {name} {d}"),
		_ => format!("→ {name}"),
	}
}

/// Marqueur live phase 1 (thinking / notes) — distinct de `--- report ---` (rapport parent phase 2).
pub(super) const LIVE_NOTES_MARKER: &str = "--- notes ---";

/// Compose le texte live : activity + preview notes (tronquée).
pub(super) fn build_live_preview(activity: &[String], report: &str) -> String {
	let mut out = activity.join("\n");
	let trimmed = report.trim();
	if trimmed.is_empty() {
		return out;
	}
	if !out.is_empty() {
		out.push('\n');
	}
	out.push_str(LIVE_NOTES_MARKER);
	out.push('\n');
	if trimmed.len() <= EXPLORE_LIVE_REPORT_MAX_CHARS {
		out.push_str(trimmed);
	} else {
		// Byte budget — floor to a char boundary (FR accents must not panic).
		let start = trimmed.floor_char_boundary(
			trimmed.len().saturating_sub(EXPLORE_LIVE_REPORT_MAX_CHARS),
		);
		let mut slice = &trimmed[start..];
		if let Some(i) = slice.find('\n') {
			slice = &slice[i + 1..];
		}
		out.push_str("…\n");
		out.push_str(slice);
	}
	out
}

pub(super) fn report_explore_progress(parent_ctx: &ToolContext, live_log: &str, started: Instant) {
	let Some(sink) = parent_ctx.tool_progress.as_ref() else {
		return;
	};
	let lines: Vec<&str> = live_log.lines().collect();
	let total_lines = lines.len();
	let tail: String = lines
		.iter()
		.rev()
		.take(EXPLORE_PROGRESS_TAIL_LINES)
		.copied()
		.collect::<Vec<_>>()
		.into_iter()
		.rev()
		.collect::<Vec<_>>()
		.join("\n");
	sink.report_text(ShellProgressUpdate {
		output: tail,
		full_output: live_log.to_string(),
		elapsed_ms: started.elapsed().as_millis() as u64,
		total_lines,
	});
}

pub(super) fn flush_progress_throttled(
	parent_ctx: &ToolContext,
	live: &str,
	started: Instant,
	last: &mut Instant,
	force: bool,
) {
	if !force && last.elapsed() < EXPLORE_PROGRESS_INTERVAL {
		return;
	}
	if live.is_empty() {
		return;
	}
	report_explore_progress(parent_ctx, live, started);
	*last = Instant::now();
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn live_preview_uses_notes_marker_not_report() {
		let live = build_live_preview(&[String::from("→ glob **/*.md")], "thinking…");
		assert!(live.contains("--- notes ---"));
		assert!(!live.contains("--- report ---"));
		assert!(live.contains("thinking…"));
	}

	#[test]
	fn live_preview_truncates_multibyte_utf8_without_panic() {
		// Longer than EXPLORE_LIVE_REPORT_MAX_CHARS with multi-byte chars near the cut.
		let chunk = "été café naïve — ";
		let report = chunk.repeat(80);
		assert!(report.len() > EXPLORE_LIVE_REPORT_MAX_CHARS);
		let live = build_live_preview(&[], &report);
		assert!(live.contains(LIVE_NOTES_MARKER));
		assert!(live.contains('…'));
	}
}
