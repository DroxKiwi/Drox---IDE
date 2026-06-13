//! LLM boot tour — no tools, JSON-only reply.

use std::sync::Arc;

use drox_llm::{ChatOptions, LlmClient};
use drox_types::{Message, StreamEvent, Usage};
use futures::StreamExt;
use tracing::{info, warn};

use super::flags::RunIntentFlags;
use super::parse::parse_run_intent_json;
use super::prompt::{RUN_INTENT_PROBE_RETRY, RUN_INTENT_PROBE_SYSTEM};
use crate::orchestration::sanitize_architect_user_prompt;

const PROBE_MAX_TOKENS: u32 = 96;
const PROBE_MAX_ATTEMPTS: u32 = 2;

/// Run the boot intent probe (max two LLM attempts, then fallback).
pub async fn run_intent_probe(
    llm: Arc<dyn LlmClient>,
    user_prompt: &str,
) -> RunIntentFlags {
    let literal = sanitize_architect_user_prompt(user_prompt);
    if literal.trim().is_empty() {
        return RunIntentFlags::fallback_default();
    }

    for attempt in 0..PROBE_MAX_ATTEMPTS {
        let retry = attempt > 0;
        let text = match probe_llm_turn(llm.as_ref(), &literal, retry).await {
            Ok(t) => t,
            Err(err) => {
                warn!(error = %err, attempt, "intent_probe llm error");
                continue;
            }
        };
        match parse_run_intent_json(&text) {
            Ok(flags) => {
                info!(
                    intent_probe = "ok",
                    greeting_only = flags.greeting_only,
                    expects_workspace_mutation = flags.expects_workspace_mutation,
                    attempt,
                    "intent probe resolved"
                );
                return flags;
            }
            Err(reason) => {
                warn!(
                    intent_probe = "parse_fail",
                    reason,
                    attempt,
                    "intent probe JSON invalid"
                );
            }
        }
    }

    warn!(intent_probe = "fallback", "intent probe exhausted — conservative defaults");
    RunIntentFlags::fallback_default()
}

async fn probe_llm_turn(
    llm: &dyn LlmClient,
    user_literal: &str,
    retry: bool,
) -> Result<String, drox_llm::LlmError> {
    let mut messages = vec![
        Message::system(RUN_INTENT_PROBE_SYSTEM),
        Message::user(user_literal),
    ];
    if retry {
        messages.push(Message::user(RUN_INTENT_PROBE_RETRY));
    }

    let options = ChatOptions::default()
        .with_temperature(0.0)
        .with_max_tokens(PROBE_MAX_TOKENS)
        .with_think(Some(false));

    let mut stream = llm.stream_chat(messages, options).await?;
    let mut buffer = String::new();
    let mut _usage = Usage::default();
    while let Some(ev) = stream.next().await {
        match ev? {
            StreamEvent::TextDelta { text } => buffer.push_str(&text),
            StreamEvent::Stop { usage, .. } => _usage = usage,
            _ => {}
        }
    }
    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use drox_llm::{ChatOptions, LlmClient, LlmError, StreamHandle};
    use drox_types::{Message, StopReason, StreamEvent, Usage};
    use futures::stream;
    use futures::StreamExt;
    use std::sync::{Arc, Mutex};

    struct ProbeScriptLlm {
        scripts: Mutex<Vec<Vec<StreamEvent>>>,
    }

    #[async_trait]
    impl LlmClient for ProbeScriptLlm {
        async fn stream_chat(
            &self,
            _messages: Vec<Message>,
            _options: ChatOptions,
        ) -> Result<StreamHandle, LlmError> {
            let script = self.scripts.lock().unwrap().remove(0);
            Ok(stream::iter(script.into_iter().map(Ok)).boxed())
        }
    }

    fn probe_script(json: &str) -> Vec<StreamEvent> {
        vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: json.to_string(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ]
    }

    #[tokio::test]
    async fn runner_parses_greeting_probe_response() {
        let llm = Arc::new(ProbeScriptLlm {
            scripts: Mutex::new(vec![probe_script(
                r#"{"probe":"run_intent","greeting_only":true,"expects_workspace_mutation":false}"#,
            )]),
        });
        let flags = run_intent_probe(llm, "Hallo!").await;
        assert!(flags.greeting_only);
        assert!(!flags.expects_workspace_mutation);
    }

    #[tokio::test]
    async fn runner_falls_back_on_invalid_json() {
        let llm = Arc::new(ProbeScriptLlm {
            scripts: Mutex::new(vec![
                probe_script("not json"),
                probe_script("still not json"),
            ]),
        });
        let flags = run_intent_probe(llm, "salut").await;
        assert_eq!(
            flags.source,
            super::super::flags::ProbeSource::FallbackDefault
        );
        assert!(!flags.greeting_only);
        assert!(flags.expects_workspace_mutation);
    }

    #[tokio::test]
    async fn runner_compound_plan_brief_expects_mutation() {
        let llm = Arc::new(ProbeScriptLlm {
            scripts: Mutex::new(vec![probe_script(
                r#"{"probe":"run_intent","greeting_only":false,"expects_workspace_mutation":true}"#,
            )]),
        });
        let brief = "Tu peux analyser le projet, et ajouter une transition animé type svg \
            entre les deux sections scrollable de la page d'accueil ? Pour le faire, dresse un plan stp";
        let flags = run_intent_probe(llm, brief).await;
        assert!(!flags.greeting_only);
        assert!(flags.expects_workspace_mutation);
    }
}
