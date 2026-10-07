//! Classif boot session — ask multi-bool depuis [`drox_prompts`], zéro heuristique NL.

use drox_llm::{ChatOptions, LlmClient};
use drox_prompts::{
	parse_session_user_intent, session_user_intent_user_message, SessionUserIntent,
	SESSION_USER_INTENT_SYSTEM,
};
use drox_types::{Message, StreamEvent};
use futures::StreamExt;
use tracing::{debug, warn};

/// Applique les frames issus du classif (ou des flags pré-classifiés).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct SessionFrames {
	pub work_plan: bool,
	pub analysis: bool,
	pub doc_ingestion: bool,
}

impl From<SessionUserIntent> for SessionFrames {
	fn from(i: SessionUserIntent) -> Self {
		let i = i.normalized();
		Self {
			work_plan: i.is_work,
			analysis: i.is_analysis,
			doc_ingestion: i.is_doc_ingestion,
		}
	}
}

/// One-shot LLM (tools off) → [`SessionFrames`]. Échec parse/transport → `None`.
pub(crate) async fn classify_session_user_intent(
	llm: &dyn LlmClient,
	base_options: &ChatOptions,
	user_message: &str,
) -> Option<SessionFrames> {
	let trimmed = user_message.trim();
	if trimmed.is_empty() {
		return Some(SessionFrames::default());
	}
	let messages = vec![
		Message::system(SESSION_USER_INTENT_SYSTEM),
		Message::user(session_user_intent_user_message(trimmed)),
	];
	let options = base_options.clone().with_tools(Vec::new()).with_think(Some(false));
	let mut stream = match llm.stream_chat(messages, options).await {
		Ok(s) => s,
		Err(e) => {
			warn!(?e, "session intent classify — stream_chat failed");
			return None;
		}
	};
	let mut out = String::new();
	while let Some(ev) = stream.next().await {
		match ev {
			Ok(StreamEvent::TextDelta { text }) => out.push_str(&text),
			Ok(StreamEvent::Stop { .. }) => break,
			Ok(_) => {}
			Err(e) => {
				warn!(?e, "session intent classify — stream error");
				return None;
			}
		}
	}
	let parsed = parse_session_user_intent(&out);
	if let Some(intent) = parsed {
		debug!(
			is_work = intent.is_work,
			is_analysis = intent.is_analysis,
			is_doc_ingestion = intent.is_doc_ingestion,
			"session intent classified"
		);
		Some(SessionFrames::from(intent))
	} else {
		warn!(raw_len = out.len(), "session intent classify — parse failed");
		None
	}
}
