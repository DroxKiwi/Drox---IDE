//! Assemble Explore — commits + L0 → bundle parent (0 LLM).

use std::collections::BTreeMap;

use drox_tools::{
	build_blurb, ExploreCommitHandle, ExploreOutcome, ExploreRequest, ExploreReturnKind,
	ToolContext, EXPLORE_BLURB_MAX_CHARS,
};
use tracing::warn;

use super::super::explore_artifact::{
	build_artifacts_inline, kind_body_usable, kinds_map_to_markdown, write_explore_bundle,
	EXPLORE_SUMMARY_MAX_CHARS,
};
use super::super::report::parent_facing_report;

/// Construit le rapport parent + artefacts depuis le handle de commits.
pub(super) fn assemble_explore_outcome(
	parent_ctx: &ToolContext,
	session_id: &str,
	request: &ExploreRequest,
	commit_handle: &ExploreCommitHandle,
	hit_max: bool,
	iterations_used: usize,
	max_iterations: usize,
) -> Result<ExploreOutcome, drox_tools::ToolError> {
	let kind_map = commit_handle.kind_map_for_assemble();
	let (report_body, kind_bodies) = if kind_map.is_empty() && !request.return_kinds.is_empty() {
		warn!("explore assemble: no committed/L0 kinds — incomplete exit");
		let body = parent_facing_report(
			&format!(
				"## Findings\n(No explore_commit bodies and no L0 paths — kinds incomplete: {}.)\n\n\
## Gaps\nCommit requested kinds with `explore_commit` during exploration, or re-run narrower.\n\n\
## Recommended next parent steps\n- Re-run Explore with a tighter scope; ensure the child calls explore_commit.",
				request
					.return_kinds
					.iter()
					.map(|k| k.as_str())
					.collect::<Vec<_>>()
					.join(", ")
			),
			hit_max,
		);
		(body, None)
	} else if kind_map.is_empty() {
		(
			parent_facing_report("## Findings\n(No return_kinds requested.)\n", hit_max),
			None,
		)
	} else {
		let md = kinds_map_to_markdown(&kind_map, &request.return_kinds, None);
		(parent_facing_report(&md, hit_max), Some(kind_map))
	};

	// Blurb moteur : jamais le CoT TextDelta — seulement kinds utilisables.
	let engine_summary =
		engine_summary_from_kinds(kind_bodies.as_ref(), &request.return_kinds, hit_max);

	let ws = parent_ctx.effective_workspace();
	match write_explore_bundle(
		&ws,
		session_id,
		request.title.as_deref(),
		request.plan_step_id.as_deref(),
		&request.return_kinds,
		&request.return_options,
		&report_body,
		kind_bodies.as_ref(),
		hit_max,
	) {
		Ok(mut bundle) => {
			if !engine_summary.is_empty() {
				bundle.summary = engine_summary.clone();
				bundle.blurb = build_blurb(&engine_summary, EXPLORE_BLURB_MAX_CHARS);
			}
			let kinds_incomplete = bundle.kinds_incomplete;
			let truncated = hit_max || !kinds_incomplete.is_empty();
			let artifacts_inline = build_artifacts_inline(
				kind_bodies.as_ref(),
				&request.return_kinds,
				&bundle.artifacts,
			);
			Ok(ExploreOutcome {
				explore_id: bundle.explore_id,
				report: report_body,
				report_path: bundle.report_path,
				summary: bundle.summary,
				blurb: bundle.blurb,
				artifacts: bundle.artifacts,
				artifacts_inline,
				kinds_incomplete,
				truncated,
				status: bundle.status,
				iterations_used,
				max_iterations,
			})
		}
		Err(e) => {
			warn!(error = %e, "explore artifact write failed");
			let summary = if engine_summary.is_empty() {
				engine_summary_from_kinds(None, &request.return_kinds, true)
			} else {
				engine_summary
			};
			let artifacts_inline =
				build_artifacts_inline(kind_bodies.as_ref(), &request.return_kinds, &BTreeMap::new());
			let kinds_incomplete: Vec<String> = request
				.return_kinds
				.iter()
				.map(|k| k.as_str().to_string())
				.collect();
			let status = if !kinds_incomplete.is_empty() {
				"partial".into()
			} else {
				"truncated_exec".into()
			};
			Ok(ExploreOutcome {
				explore_id: format!(
					"exp_adhoc_{}",
					chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ")
				),
				report: report_body,
				report_path: None,
				blurb: build_blurb(&summary, EXPLORE_BLURB_MAX_CHARS),
				summary,
				artifacts: Default::default(),
				artifacts_inline,
				kinds_incomplete,
				truncated: true,
				status,
				iterations_used,
				max_iterations,
			})
		}
	}
}

fn engine_summary_from_kinds(
	kind_bodies: Option<&BTreeMap<String, String>>,
	requested: &[ExploreReturnKind],
	hit_max: bool,
) -> String {
	let Some(map) = kind_bodies else {
		return if hit_max {
			"Explore hit iteration ceiling without usable explore_commit / L0 kinds.".into()
		} else {
			"Explore ended without usable explore_commit / L0 kinds.".into()
		};
	};
	let order: Vec<&str> = if requested.is_empty() {
		map.keys().map(|s| s.as_str()).collect()
	} else {
		requested.iter().map(|k| k.as_str()).collect()
	};
	let mut parts = Vec::new();
	for key in order {
		if let Some(body) = map.get(key) {
			if kind_body_usable(body) {
				let clipped: String = body.chars().take(220).collect();
				parts.push(format!("{key}: {clipped}"));
			}
		}
	}
	if parts.is_empty() {
		return if hit_max {
			"Explore hit iteration ceiling; committed kinds were empty/stub.".into()
		} else {
			"Explore commits produced no usable kind bodies.".into()
		};
	}
	let joined = parts.join(" · ");
	if joined.chars().count() <= EXPLORE_SUMMARY_MAX_CHARS {
		joined
	} else {
		joined
			.chars()
			.take(EXPLORE_SUMMARY_MAX_CHARS)
			.collect::<String>()
			+ "…"
	}
}
