//! Questions modèle one-shot (boot session) — source unique hors fork VS Code.
//!
//! Pas d'heuristique NL : le moteur appelle le LLM avec ces templates, parse le
//! JSON, puis applique des flags mécaniques (`work_plan_frame`, …).

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

/// Schema JSON attendu (multi-bool, un seul RTT).
pub const SESSION_USER_INTENT_SCHEMA_HINT: &str =
	r#"{"isWork":boolean,"isAnalysis":boolean,"isDocIngestion":boolean}"#;

pub const SESSION_USER_INTENT_SYSTEM: &str = "\
You classify the user message for a coding-agent session boot.\n\
Reply with ONE JSON object only. No markdown fences. No commentary.\n\
Schema: {\"isWork\":boolean,\"isAnalysis\":boolean,\"isDocIngestion\":boolean}\n\
\n\
Definitions:\n\
- isWork=true: the user asks for work (explore, implement, fix, refactor, document, plan, investigate, update pages, etc.).\n\
  isWork=false: greetings, thanks, pure chitchat, or acknowledgements with no ask.\n\
- isAnalysis=true: the user wants a repo/project analysis, architecture overview, survey/cartography of the codebase.\n\
  isAnalysis=false otherwise.\n\
- isDocIngestion=true: the user wants to learn / ingest / mirror / rewrite a multi-file docs tree (or official pedagogy docs) into the project.\n\
  isDocIngestion=false otherwise.\n\
\n\
Rules:\n\
- When unsure but a concrete deliverable is implied, prefer isWork=true.\n\
- isAnalysis and isDocIngestion imply isWork=true (set isWork=true if either is true).\n\
- Booleans only; omit no keys.";

pub const SESSION_USER_INTENT_USER_TEMPLATE: &str = "\
User message:\n\
\"\"\"\n\
{{userMessage}}\n\
\"\"\"\n\
Return {\"isWork\":boolean,\"isAnalysis\":boolean,\"isDocIngestion\":boolean} now.";

/// Body catalogue = system prompt (la fiche pointe le texte d'ask).
pub const SESSION_USER_INTENT_ENTRY: PromptEntry = PromptEntry {
	id: "model_question.session.user_intent",
	intent: PromptIntent::ModelQuestion,
	strength: PromptStrength::MustText,
	audience: PromptAudience::ModelQuestion,
	when: "session_boot_classify",
	topics: &["model_question", "work_plan_frame", "analyzing", "doc_ingestion"],
	claims: &[
		"model_question.session.user_intent=multi_bool_json",
		"triggers_nudge.work_plan_frame=runtime.work_plan_frame",
		"triggers_nudge.analysis_frame=runtime.analyzing_phase",
		"triggers_nudge.doc_ingestion_frame=runtime.doc_ingestion",
		"heuristic.user_message_needles=forbidden",
	],
	body: SESSION_USER_INTENT_SYSTEM,
};

/// Rend le message user de l'ask (remplace `{{userMessage}}`).
#[must_use]
pub fn session_user_intent_user_message(user_message: &str) -> String {
	SESSION_USER_INTENT_USER_TEMPLATE.replace("{{userMessage}}", user_message.trim())
}

/// Flags issus du classif boot.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SessionUserIntent {
	pub is_work: bool,
	pub is_analysis: bool,
	pub is_doc_ingestion: bool,
}

impl SessionUserIntent {
	/// Normalise : analysis / doc_ingestion ⇒ work.
	#[must_use]
	pub fn normalized(self) -> Self {
		let is_work = self.is_work || self.is_analysis || self.is_doc_ingestion;
		Self {
			is_work,
			is_analysis: self.is_analysis,
			is_doc_ingestion: self.is_doc_ingestion,
		}
	}
}

/// Extrait le premier objet JSON d'une réponse modèle (tolère fences).
#[must_use]
pub fn extract_json_object_text(raw: &str) -> Option<&str> {
	let trimmed = raw.trim();
	if trimmed.is_empty() {
		return None;
	}
	let body = if let Some(start) = trimmed.find("```") {
		let after = trimmed[start + 3..].trim_start();
		let after = after
			.strip_prefix("json")
			.or_else(|| after.strip_prefix("JSON"))
			.unwrap_or(after)
			.trim_start();
		let end = after.find("```")?;
		after[..end].trim()
	} else {
		trimmed
	};
	let start = body.find('{')?;
	let end = body.rfind('}')?;
	if end <= start {
		return None;
	}
	Some(&body[start..=end])
}

/// Parse `{"isWork","isAnalysis","isDocIngestion"}` (aliases snake_case acceptés).
#[must_use]
pub fn parse_session_user_intent(raw_model_text: &str) -> Option<SessionUserIntent> {
	let json_text = extract_json_object_text(raw_model_text)?;
	let value: serde_json::Value = serde_json::from_str(json_text).ok()?;
	let obj = value.as_object()?;
	let is_work = json_bool_field(obj, &["isWork", "is_work"])?;
	let is_analysis = json_bool_field(obj, &["isAnalysis", "is_analysis"])?;
	let is_doc_ingestion = json_bool_field(obj, &["isDocIngestion", "is_doc_ingestion"])?;
	Some(
		SessionUserIntent {
			is_work,
			is_analysis,
			is_doc_ingestion,
		}
		.normalized(),
	)
}

fn json_bool_field(obj: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> Option<bool> {
	for k in keys {
		if let Some(v) = obj.get(*k) {
			return v.as_bool();
		}
	}
	None
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn parse_multi_bool_happy() {
		let raw = r#"{"isWork":true,"isAnalysis":true,"isDocIngestion":false}"#;
		let i = parse_session_user_intent(raw).unwrap();
		assert!(i.is_work);
		assert!(i.is_analysis);
		assert!(!i.is_doc_ingestion);
	}

	#[test]
	fn analysis_implies_work() {
		let raw = r#"{"isWork":false,"isAnalysis":true,"isDocIngestion":false}"#;
		let i = parse_session_user_intent(raw).unwrap();
		assert!(i.is_work);
		assert!(i.is_analysis);
	}

	#[test]
	fn tolerates_fence() {
		let raw = "```json\n{\"isWork\":false,\"isAnalysis\":false,\"isDocIngestion\":false}\n```";
		let i = parse_session_user_intent(raw).unwrap();
		assert!(!i.is_work);
	}
}
