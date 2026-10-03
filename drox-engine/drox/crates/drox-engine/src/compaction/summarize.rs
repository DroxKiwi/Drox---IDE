//! Résumé LLM d'un run (`summarize_run`) pour persistance ou live.

use drox_llm::{ChatOptions, LlmClient};
use drox_types::{Message, StreamEvent, Usage};
use drox_tools::SessionNote;
use futures::StreamExt;
use tracing::warn;

use crate::error::EngineError;

use super::helpers::{condense_messages_for_summary, extract_metadata};
use super::types::{CompactionConfig, CompactionResult};

/// Appelle le LLM pour produire un résumé persistable du run.
///
/// `messages` est l'historique complet à résumer — en pratique : le system
/// prompt initial + le message user d'origine + les tours assistant/tool
/// du run. Les notes `session_note` sont concaténées séparément dans le
/// payload utilisateur de la compaction (zone « Pinned notes »).
///
/// `compaction_system_prompt` est le prompt qui décrit au modèle le format
/// attendu (cf. `drox-cli/prompts::COMPACTION_PROMPT`). Volontairement
/// passé en paramètre plutôt qu'embarqué dans `drox-engine` pour ne pas
/// dupliquer la convention de prompts entre crates.
/// Résume pour persistance M1 (condensé standard).
pub async fn summarize_run(
    llm: &dyn LlmClient,
    compaction_system_prompt: &str,
    messages: &[Message],
    notes: &[SessionNote],
    config: &CompactionConfig,
) -> Result<CompactionResult, EngineError> {
    summarize_run_inner(
        llm,
        compaction_system_prompt,
        messages,
        notes,
        config,
        false,
    )
    .await
}

/// Résume pour compaction live (condensé plus agressif sur les `tool_result`).
pub(crate) async fn summarize_run_for_live(
    llm: &dyn LlmClient,
    compaction_system_prompt: &str,
    messages: &[Message],
    notes: &[SessionNote],
    config: &CompactionConfig,
) -> Result<CompactionResult, EngineError> {
    summarize_run_inner(
        llm,
        compaction_system_prompt,
        messages,
        notes,
        config,
        true,
    )
    .await
}

async fn summarize_run_inner(
    llm: &dyn LlmClient,
    compaction_system_prompt: &str,
    messages: &[Message],
    notes: &[SessionNote],
    config: &CompactionConfig,
    for_live_summarize: bool,
) -> Result<CompactionResult, EngineError> {
    let condensed = condense_messages_for_summary(messages, notes, config, for_live_summarize);
    let summary_messages = vec![
        Message::system(compaction_system_prompt),
        Message::user(condensed),
    ];
    let options = ChatOptions::default()
        .with_temperature(config.temperature)
        .with_max_tokens(config.max_summary_tokens);

    let mut stream = llm
        .stream_chat(summary_messages, options)
        .await
        .map_err(EngineError::from)?;
    let mut buffer = String::new();
    let mut usage: Option<Usage> = None;
    while let Some(ev) = stream.next().await {
        match ev.map_err(EngineError::from)? {
            StreamEvent::TextDelta { text } => buffer.push_str(&text),
            StreamEvent::Stop { usage: u, .. } => usage = Some(u),
            _ => {}
        }
    }
    if buffer.trim().is_empty() {
        warn!("compaction: LLM returned empty summary");
    }
    let (objective, files_touched) = extract_metadata(&buffer);
    Ok(CompactionResult {
        objective,
        files_touched,
        summary: buffer,
        usage,
    })
}

