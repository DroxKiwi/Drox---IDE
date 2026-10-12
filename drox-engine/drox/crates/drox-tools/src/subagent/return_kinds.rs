//! Contrats de retour Explore — kinds typés + options (V1).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Formats de retour que le parent peut cocher sur `task`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExploreReturnKind {
	/// Chemins lus / inventoriés.
	PathsRead,
	/// Résumé court par fichier.
	FileSummaries,
	/// Symboles / fns / types / routes clés.
	KeySymbols,
	/// Extraits de code bornés.
	CodeSnippets,
	/// Arbo / modules.
	StructureMap,
	/// Ce qui manque / incertitudes.
	Gaps,
}

impl ExploreReturnKind {
	#[must_use]
	pub const fn as_str(self) -> &'static str {
		match self {
			Self::PathsRead => "paths_read",
			Self::FileSummaries => "file_summaries",
			Self::KeySymbols => "key_symbols",
			Self::CodeSnippets => "code_snippets",
			Self::StructureMap => "structure_map",
			Self::Gaps => "gaps",
		}
	}

	#[must_use]
	pub fn parse(raw: &str) -> Option<Self> {
		match raw.trim().to_ascii_lowercase().as_str() {
			"paths_read" | "paths" => Some(Self::PathsRead),
			"file_summaries" | "summaries" => Some(Self::FileSummaries),
			"key_symbols" | "symbols" => Some(Self::KeySymbols),
			"code_snippets" | "snippets" => Some(Self::CodeSnippets),
			"structure_map" | "structure" => Some(Self::StructureMap),
			"gaps" => Some(Self::Gaps),
			_ => None,
		}
	}

	#[must_use]
	pub const fn all() -> &'static [Self] {
		&[
			Self::PathsRead,
			Self::FileSummaries,
			Self::KeySymbols,
			Self::CodeSnippets,
			Self::StructureMap,
			Self::Gaps,
		]
	}

	/// Nom de fichier artefact sous le dossier Explore.
	#[must_use]
	pub fn artifact_filename(self) -> String {
		format!("{}.md", self.as_str())
	}
}

/// Sous-précisions optionnelles (caps / focus) — un objet pour tous les kinds V1.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExploreReturnOptions {
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub max_files: Option<u32>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub max_chars_per_file: Option<u32>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub max_snippets: Option<u32>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub max_items: Option<u32>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub max_depth: Option<u32>,
	/// `architecture` | `api` | `ui` | …
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub focus: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub signatures_only: Option<bool>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub include_line_counts: Option<bool>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub glob_filter: Option<String>,
	/// ex. `fn`, `type`, `route`
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub symbol_kinds: Option<Vec<String>>,
}

/// Parse une liste de strings (args tool) → kinds valides (dédupliqués, ordre conservé).
#[must_use]
pub fn parse_return_kinds(raw: &[String]) -> Vec<ExploreReturnKind> {
	let mut out = Vec::new();
	for s in raw {
		if let Some(k) = ExploreReturnKind::parse(s) {
			if !out.contains(&k) {
				out.push(k);
			}
		}
	}
	out
}

/// Brief **phase 1** (enfant) — kinds à déposer via `explore_commit` (canal tools).
#[must_use]
pub fn format_kinds_contract(kinds: &[ExploreReturnKind], options: &ExploreReturnOptions) -> String {
	if kinds.is_empty() {
		return String::new();
	}
	let mut out = String::from(
		"## Return contract (phase 1 — progressive `explore_commit`)\n\
		 Deposit these kinds with the **`explore_commit`** tool after each useful batch \
		 (`{\"kind\":\"…\",\"body\":\"…\",\"append\"?:true}`). \
		 Each `body` is **mono-kind facts only** (bullets/paths) — no CoT, no `## <other_kind>` \
		 inside the same body (engine rejects). \
		 Do **not** write a freeform parent report or `## <kind>` essay in chat — commits are the contract.\n\
		 `paths_read` is also auto-filled by the engine from your tool calls.\n\
		 Kinds:\n",
	);
	for k in kinds {
		out.push_str("- `");
		out.push_str(k.as_str());
		out.push_str("`\n");
	}
	if let Ok(opts) = serde_json::to_string(options) {
		if opts != "{}" {
			out.push_str("\nOptions (honor caps when present): ");
			out.push_str(&opts);
			out.push('\n');
		}
	}
	out
}

/// Contrat **phase 2** (synthétiseur) — JSON strict, clés = kinds demandés.
#[must_use]
pub fn format_kinds_json_contract(kinds: &[ExploreReturnKind], options: &ExploreReturnOptions) -> String {
	if kinds.is_empty() {
		return String::from(
			"Output a single JSON object only (no markdown fences, no preamble) with keys \
			 `findings`, `paths`, `gaps`, `recommended_next_parent_steps` (string values).",
		);
	}
	let keys: Vec<&str> = kinds.iter().map(|k| k.as_str()).collect();
	let mut out = String::from(
		"Output a **single JSON object only** — no markdown fences, no preamble, no chain-of-thought.\n\
		 Keys (all required, string values, markdown allowed **inside** strings):\n",
	);
	for k in &keys {
		out.push_str("- `");
		out.push_str(k);
		out.push_str("`\n");
	}
	out.push_str("- `recommended_next_parent_steps` (short)\n");
	out.push_str("\nExample shape: {");
	for (i, k) in keys.iter().enumerate() {
		if i > 0 {
			out.push_str(", ");
		}
		out.push('"');
		out.push_str(k);
		out.push_str("\": \"…\"");
	}
	out.push_str(", \"recommended_next_parent_steps\": \"…\"}\n");
	if let Ok(opts) = serde_json::to_string(options) {
		if opts != "{}" {
			out.push_str("Honor caps when present: ");
			out.push_str(&opts);
			out.push('\n');
		}
	}
	out
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn parse_aliases() {
		assert_eq!(ExploreReturnKind::parse("paths"), Some(ExploreReturnKind::PathsRead));
		assert_eq!(
			ExploreReturnKind::parse("file_summaries"),
			Some(ExploreReturnKind::FileSummaries)
		);
		assert!(ExploreReturnKind::parse("nope").is_none());
	}

	#[test]
	fn dedup_preserves_order() {
		let raw = vec![
			"paths_read".into(),
			"gaps".into(),
			"paths".into(),
			"gaps".into(),
		];
		assert_eq!(
			parse_return_kinds(&raw),
			vec![ExploreReturnKind::PathsRead, ExploreReturnKind::Gaps]
		);
	}

	#[test]
	fn phase1_contract_asks_explore_commit() {
		let kinds = vec![ExploreReturnKind::PathsRead, ExploreReturnKind::Gaps];
		let p1 = format_kinds_contract(&kinds, &ExploreReturnOptions::default());
		assert!(p1.contains("explore_commit"));
		assert!(p1.contains("Do **not** write a freeform"));
		let p2 = format_kinds_json_contract(&kinds, &ExploreReturnOptions::default());
		assert!(p2.contains("JSON object"));
		assert!(p2.contains("paths_read"));
		assert!(p2.contains("recommended_next_parent_steps"));
	}
}
