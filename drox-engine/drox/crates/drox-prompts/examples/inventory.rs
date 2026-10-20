//! Inventaire volumes catalogue — `cargo run -p drox-prompts --example inventory`

use drox_prompts::{all_entries, PromptAudience};

fn main() {
	let mut rows: Vec<_> = all_entries()
		.iter()
		.map(|e| {
			(
				e.body.chars().count(),
				e.id,
				format!("{:?}", e.audience),
				format!("{:?}", e.intent),
				format!("{:?}", e.strength),
				e.when,
			)
		})
		.collect();
	rows.sort_by(|a, b| b.0.cmp(&a.0));

	println!("=== TOP 35 by chars ===");
	for (n, id, aud, intent, strength, when) in rows.iter().take(35) {
		println!(
			"{n:5} ~{:>4}tok  {aud:12} {intent:12} {strength:8}  {id}  when={when}",
			n / 4
		);
	}

	let mut by_aud: Vec<(String, usize, usize)> = Vec::new();
	for aud in [
		"Parent",
		"ExploreChild",
		"ToolSchema",
		"Compaction",
		"ModelQuestion",
	] {
		let subset: Vec<_> = rows.iter().filter(|r| r.2 == aud).collect();
		let sum: usize = subset.iter().map(|r| r.0).sum();
		by_aud.push((aud.into(), subset.len(), sum));
	}
	println!("\n=== By audience ===");
	for (aud, count, sum) in &by_aud {
		println!("{aud:14} n={count:3}  chars={sum:6}  ~{}tok", sum / 4);
	}

	let pick = |id: &str| {
		all_entries()
			.iter()
			.find(|e| e.id == id)
			.map(|e| e.body.chars().count())
	};
	println!("\n=== Key session / explore blobs ===");
	for id in [
		"session.core",
		"session.subagents.explore",
		"session.native_thinking",
		"session.outside_ws.read",
		"session.professor",
		"explore.system",
		"tools.task.description",
		"tools.explore_commit.description",
		"tools.file_read.description",
		"runtime.post_merge_closure",
		"runtime.explore_covered_reread",
		"runtime.post_explore_stall_act",
		"runtime.explore_artifact_read_fail",
		"runtime.doc_ingestion",
		"runtime.work_plan_frame",
		"gates.repeated_file_read",
	] {
		println!("{id:40} {:?}", pick(id));
	}

	let tools: usize = all_entries()
		.iter()
		.filter(|e| e.audience == PromptAudience::ToolSchema)
		.map(|e| e.body.chars().count())
		.sum();
	let parent_session: usize = all_entries()
		.iter()
		.filter(|e| {
			e.audience == PromptAudience::Parent
				&& (e.id.starts_with("session.") || e.id == "session.core")
		})
		.map(|e| e.body.chars().count())
		.sum();
	let parent_runtime: usize = all_entries()
		.iter()
		.filter(|e| {
			e.audience == PromptAudience::Parent
				&& (e.id.starts_with("runtime.") || e.id.starts_with("gates."))
		})
		.map(|e| e.body.chars().count())
		.sum();

	println!("\n=== Aggregates (catalogue only; IDE host params.system NOT included) ===");
	println!(
		"Parent session.* sum (if all toggles on): {parent_session} ~{}tok",
		parent_session / 4
	);
	println!(
		"Parent runtime.*+gates.* sum (NOT simultaneous): {parent_runtime} ~{}tok",
		parent_runtime / 4
	);
	println!("All ToolSchema sum: {tools} ~{}tok", tools / 4);
	println!("Total entries: {}", all_entries().len());

	// S2 rough: core + explore supplement + native thinking + outside read + all tools
	let s2 = pick("session.core").unwrap_or(0)
		+ pick("session.subagents.explore").unwrap_or(0)
		+ pick("session.native_thinking").unwrap_or(0)
		+ pick("session.outside_ws.read").unwrap_or(0)
		+ tools;
	println!(
		"\nS2-ish boot (core+explore+think+ows_read+ALL tool descs): {s2} ~{}tok",
		s2 / 4
	);
}
