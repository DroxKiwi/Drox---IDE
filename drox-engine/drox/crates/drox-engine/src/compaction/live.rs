//! Compaction live : split, checkpoint, `try_live_compact`, `compact_until_budget`.

use std::fmt::Write as _;

use drox_llm::LlmClient;
use drox_types::{Message, Usage};
use tracing::{debug, warn};

use crate::context::ContextPolicy;

use super::helpers::{extract_metadata, truncate_chars};
use super::summarize::summarize_run_for_live;
use super::types::CompactionConfig;

/// Messages conservés en fin d'historique (borne haute ; le split peut réduire la queue).
pub const LIVE_COMPACT_TAIL_KEEP_MESSAGES: usize = 4;

/// Fraction max de la fenêtre effective pour la queue tail (tokens).
pub const LIVE_COMPACT_MAX_TAIL_RATIO: f32 = 0.20;

/// Borne basse de jetons (dans `messages[1..split]`) avant d'appeler le LLM.
pub const LIVE_COMPACT_MIN_PREFIX_TOKENS: usize = 3_000;

/// Nombre max de passes microcompact + snip + summarize par déclenchement.
pub const LIVE_COMPACT_MAX_PASSES: u32 = 3;

/// Taille max du checkpoint injecté (caractères UTF-8).
pub const CHECKPOINT_MAX_CHARS: usize = 3_000;

const CHECKPOINT_PREAMBLE: &str = "[context checkpoint — earlier messages compressed by the engine]\n\n";

/// Rapport d'une compaction live réussie.
#[derive(Debug, Clone)]
pub struct LiveCompactReport {
    pub tokens_before: usize,
    pub tokens_after: usize,
    /// Diminution du nombre de messages (`len_avant - len_après`).
    pub messages_removed: usize,
    pub usage: Option<Usage>,
    /// Markdown produit par le tour `summarize_run` (identique au checkpoint).
    pub summary_text: String,
    pub files_touched: Vec<String>,
}

/// Choisit l'index `split` tel que `messages[split..]` soit la queue préservée
/// et `messages[..split]` le préfixe à résumer (le message `messages[0]`
/// — en pratique le system prompt — est **toujours** repris tel quel dans
/// [`try_live_compact`], le résumé porte sur `messages[1..split]`).
#[must_use]
pub fn choose_live_compact_split_idx(
    messages: &[Message],
    policy: &ContextPolicy,
    tail_keep: usize,
    min_prefix_tokens: usize,
) -> Option<usize> {
    let n = messages.len();
    if tail_keep == 0 || n <= tail_keep.saturating_add(1) {
        return None;
    }
    let max_tail_tokens = (policy.budget().effective_window() as f32 * LIVE_COMPACT_MAX_TAIL_RATIO)
        as usize;

    let mut split = n.saturating_sub(tail_keep);
    if split <= 1 {
        return None;
    }

    // Réduire la queue tant qu'elle dépasse le plafond de tokens (augmenter `split`).
    while split + 1 < n {
        let tail_tokens = policy.count_tokens(&messages[split..]);
        if tail_tokens <= max_tail_tokens {
            break;
        }
        split += 1;
    }

    let mid = messages.get(1..split)?;
    if mid.is_empty() {
        return None;
    }
    let prefix_tokens = policy.count_tokens(mid);
    if prefix_tokens < min_prefix_tokens {
        return None;
    }
    Some(split)
}

/// Construit un checkpoint court à partir du markdown de compaction (sections structurées).
#[must_use]
pub fn format_compact_checkpoint(summary_md: &str) -> String {
    let (objective, files) = extract_metadata(summary_md);
    let mut body = String::new();
    if !objective.is_empty() {
        let _ = writeln!(body, "## Objective\n{objective}");
    }
    append_section_excerpt(summary_md, "decision", "## Decisions", &mut body, 400);
    append_section_excerpt(summary_md, "en cours", "## En cours", &mut body, 300);
    if !files.is_empty() {
        let _ = writeln!(body, "## Files touched");
        for path in files.iter().take(15) {
            let _ = writeln!(body, "- {path}");
        }
    }
    if body.trim().is_empty() {
        body = truncate_chars(summary_md, 800);
    }
    let full = format!("{CHECKPOINT_PREAMBLE}{body}");
    truncate_chars(&full, CHECKPOINT_MAX_CHARS)
}

fn append_section_excerpt(
    markdown: &str,
    heading_contains: &str,
    heading_out: &str,
    out: &mut String,
    max_body_chars: usize,
) {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut in_section = false;
    let mut section_body = String::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            if in_section {
                break;
            }
            if trimmed[3..].to_ascii_lowercase().contains(&heading_contains.to_ascii_lowercase()) {
                in_section = true;
                continue;
            }
        } else if in_section {
            if !trimmed.is_empty() {
                let _ = writeln!(section_body, "{trimmed}");
            }
        }
    }
    if in_section && !section_body.trim().is_empty() {
        let _ = writeln!(out, "{heading_out}");
        out.push_str(&truncate_chars(section_body.trim(), max_body_chars));
        out.push('\n');
    }
}

/// Compaction proactive : résume `messages[..split]` via [`summarize_run`],
/// puis remplace ce préfixe par `messages[0]` + un `system` checkpoint + queue.
///
/// En cas d'échec LLM, l'historique n'est **pas** modifié.
pub async fn try_live_compact(
    llm: &dyn LlmClient,
    compaction_system_prompt: &str,
    messages: &mut Vec<Message>,
    policy: &ContextPolicy,
    config: &CompactionConfig,
) -> Option<LiveCompactReport> {
    let split = choose_live_compact_split_idx(
        messages,
        policy,
        LIVE_COMPACT_TAIL_KEEP_MESSAGES,
        LIVE_COMPACT_MIN_PREFIX_TOKENS,
    )?;
    let old_len = messages.len();
    let tokens_before = policy.count_tokens(messages);
    let prefix = messages.get(..split)?.to_vec();
    let result = match summarize_run_for_live(
        llm,
        compaction_system_prompt,
        &prefix,
        &[],
        config,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(error = %e, "live compaction: summarize_run failed — leaving history untouched");
            return None;
        }
    };
    let tail = messages.get(split..)?.to_vec();
    let head = messages.first()?.clone();
    let checkpoint_body = format_compact_checkpoint(&result.summary);
    let checkpoint = Message::system(checkpoint_body);
    let mut new_msgs = Vec::with_capacity(2 + tail.len());
    new_msgs.push(head);
    new_msgs.push(checkpoint);
    new_msgs.extend(tail);
    *messages = new_msgs;
    let tokens_after = policy.count_tokens(messages);
    let messages_removed = old_len.saturating_sub(messages.len());
    debug!(
        tokens_before,
        tokens_after,
        messages_removed,
        "live compaction checkpoint applied"
    );
    Some(LiveCompactReport {
        tokens_before,
        tokens_after,
        messages_removed,
        usage: result.usage,
        summary_text: result.summary,
        files_touched: result.files_touched,
    })
}

/// Microcompact + snip agressif + summarize en boucle jusqu'au seuil ou max passes.
pub async fn compact_until_budget(
    llm: &dyn LlmClient,
    compaction_system_prompt: &str,
    messages: &mut Vec<Message>,
    policy: &ContextPolicy,
    config: &CompactionConfig,
) -> Option<LiveCompactReport> {
    use drox_context::{MicrocompactConfig, microcompact_messages};

    let threshold = policy.budget().autocompact_threshold();
    let mc_config = MicrocompactConfig::default();
    let mut last_report: Option<LiveCompactReport> = None;

    for _pass in 0..LIVE_COMPACT_MAX_PASSES {
        let tokens_start = policy.count_tokens(messages);
        if tokens_start < threshold {
            break;
        }

        let mc = microcompact_messages(messages, &mc_config);
        if mc.blocks_cleared > 0 {
            debug!(
                tools_cleared = mc.tools_cleared,
                blocks_cleared = mc.blocks_cleared,
                "microcompact applied before live compact"
            );
        }

        if let Some(report) = policy.maybe_snip_aggressive(messages) {
            debug!(
                tokens_freed = report.tokens_freed,
                blocks_snipped = report.blocks_snipped,
                "aggressive snip during compact loop"
            );
        }

        if policy.count_tokens(messages) < threshold {
            break;
        }

        let Some(report) = try_live_compact(
            llm,
            compaction_system_prompt,
            messages,
            policy,
            config,
        )
        .await
        else {
            break;
        };

        let reduced_enough = report.tokens_after < threshold;
        let meaningful = report.tokens_after * 100
            < tokens_start.saturating_mul(95);
        last_report = Some(report);
        if reduced_enough || !meaningful {
            break;
        }
    }

    last_report
}
