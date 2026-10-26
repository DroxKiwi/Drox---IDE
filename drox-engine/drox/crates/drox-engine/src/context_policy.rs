//! Politique de gestion du contexte agent.
//!
//! Wrapper minimal autour des primitives `drox-context` (compteur de tokens,
//! budget, snip) que la boucle agent consulte avant chaque tour.
//!
//! Le scope du sprint 1.9 reste volontairement étroit :
//! - on **estime** le nombre de tokens de l'historique courant ;
//! - si on dépasse le seuil d'autocompact, on tente un **snip** automatique
//!   des gros `tool_result` ;
//! - si le budget est encore au-dessus de la limite bloquante, l'agent peut
//!   décider de s'arrêter / remonter une erreur. (La compaction LLM via
//!   `Summarizer` sera branchée plus tard.)

use std::sync::Arc;

use drox_context::{
    ContextBudget, MicrocompactConfig, RoughTokenCounter, SnipConfig, TokenCounter,
    microcompact_messages,
};
use drox_types::Message;

/// C1 — tool results « chauds » complets (le reste peut être spill+stub).
pub const HOT_SNIP_KEEP_RECENT: usize = 4;

/// C1 — snip seulement au-delà de ~2k tokens estimés (~8 KiB rough) hors fenêtre chaude :
/// en dessous, le résultat (manifest, petit fichier) reste lisible tel quel.
const HOT_SNIP_MIN_TOKENS: usize = 2_000;

const HOT_SNIP_FALLBACK_PLACEHOLDER: &str =
    "[Tool output truncated for context efficiency — re-read path/spill if needed]";

/// Politique de contexte (cheap to clone).
#[derive(Clone)]
pub struct ContextPolicy {
    counter: Arc<dyn TokenCounter>,
    budget: ContextBudget,
    snip: Option<SnipConfig>,
}

impl std::fmt::Debug for ContextPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ContextPolicy")
            .field("budget", &self.budget)
            .field("snip_enabled", &self.snip.is_some())
            .finish_non_exhaustive()
    }
}

impl Default for ContextPolicy {
    /// Politique par défaut : compteur grossier + budget 200k + snip à 1k tokens.
    fn default() -> Self {
        Self {
            counter: Arc::new(RoughTokenCounter::default()),
            budget: ContextBudget::default(),
            snip: Some(SnipConfig::default()),
        }
    }
}

impl ContextPolicy {
    /// Budget aligné sur la fenêtre Ollama réelle (`num_ctx`), pour que l'autocompact
    /// se déclenche avant saturation côté serveur (ex. 41k affichés dans l'UI).
    #[must_use]
    pub fn for_model_context_window(num_ctx: usize) -> Self {
        let window = num_ctx.max(2048);
        Self {
            counter: Arc::new(RoughTokenCounter::default()),
            budget: ContextBudget::with_window(window),
            snip: Some(SnipConfig::default()),
        }
    }

    #[must_use]
    pub fn new(
        counter: Arc<dyn TokenCounter>,
        budget: ContextBudget,
        snip: Option<SnipConfig>,
    ) -> Self {
        Self {
            counter,
            budget,
            snip,
        }
    }

    /// Désactive le snip automatique (les `tool_result` ne seront pas réduits).
    #[must_use]
    pub fn without_snip(mut self) -> Self {
        self.snip = None;
        self
    }

    /// Estime le nombre de tokens consommés par la conversation actuelle.
    #[must_use]
    pub fn count_tokens(&self, messages: &[Message]) -> usize {
        self.counter.count_messages(messages)
    }

    #[must_use]
    pub const fn budget(&self) -> &ContextBudget {
        &self.budget
    }

    /// Réalise une passe de snip si elle est configurée et utile.
    ///
    /// Retourne `Some(outcome)` uniquement si au moins un bloc a été snippé.
    /// `messages` est modifié en place dans ce cas.
    pub fn maybe_snip(&self, messages: &mut Vec<Message>) -> Option<SnipReport> {
        self.maybe_snip_with_config(messages, self.snip.as_ref()?)
    }

    /// Snip avec seuils plus bas (utilisé pendant la boucle de compaction live).
    pub fn maybe_snip_aggressive(&self, messages: &mut Vec<Message>) -> Option<SnipReport> {
        let aggressive = SnipConfig {
            min_tokens: 400,
            keep_recent_results: 2,
            placeholder: drox_context::SNIP_PLACEHOLDER.into(),
        };
        self.maybe_snip_with_config(messages, &aggressive)
    }

    /// Snip « chaud » (Vague 4 S-2 → **C1**) : hors seuil autocompact,
    /// retire les `tool_result` hors des [`HOT_SNIP_KEEP_RECENT`] plus récents.
    ///
    /// Si `workspace_root` est fourni, chaque bloc snippé est **spillé sur disque**
    /// avant le stub (rien n’est jeté sans pointeur). Sinon, placeholder court.
    pub fn maybe_snip_hot(
        &self,
        messages: &mut Vec<Message>,
        workspace_root: Option<&camino::Utf8Path>,
    ) -> Option<SnipReport> {
        self.maybe_snip_hot_for_profile(
            messages,
            workspace_root,
            crate::agent::EngineProfile::CloudFull,
        )
    }

    /// [`Self::maybe_snip_hot`] avec préservation Explore adaptée au profil moteur.
    pub fn maybe_snip_hot_for_profile(
        &self,
        messages: &mut Vec<Message>,
        workspace_root: Option<&camino::Utf8Path>,
        profile: crate::agent::EngineProfile,
    ) -> Option<SnipReport> {
        if self.snip.is_none() {
            return None;
        }
        let hot = SnipConfig {
            min_tokens: HOT_SNIP_MIN_TOKENS,
            keep_recent_results: HOT_SNIP_KEEP_RECENT,
            placeholder: HOT_SNIP_FALLBACK_PLACEHOLDER.into(),
        };
        match workspace_root {
            Some(root) => {
                let root = root.to_owned();
                self.maybe_snip_with_mapper(messages, &hot, move |content| {
                    crate::agent::tool_result_spill::stub_for_hot_snip(&root, content, profile)
                })
            }
            None => self.maybe_snip_with_config(messages, &hot),
        }
    }

    fn maybe_snip_with_config(
        &self,
        messages: &mut Vec<Message>,
        config: &SnipConfig,
    ) -> Option<SnipReport> {
        let outcome = drox_context::snip_messages(messages, &*self.counter, config);
        if outcome.blocks_snipped == 0 {
            return None;
        }
        *messages = outcome.messages;
        Some(SnipReport {
            tokens_freed: outcome.tokens_freed,
            blocks_snipped: outcome.blocks_snipped,
        })
    }

    fn maybe_snip_with_mapper<F>(
        &self,
        messages: &mut Vec<Message>,
        config: &SnipConfig,
        map_placeholder: F,
    ) -> Option<SnipReport>
    where
        F: FnMut(&str) -> String,
    {
        let outcome =
            drox_context::snip_messages_with(messages, &*self.counter, config, map_placeholder);
        if outcome.blocks_snipped == 0 {
            return None;
        }
        *messages = outcome.messages;
        Some(SnipReport {
            tokens_freed: outcome.tokens_freed,
            blocks_snipped: outcome.blocks_snipped,
        })
    }

    /// Microcompact : vide les anciens `tool_result` (sans LLM).
    pub fn maybe_microcompact(&self, messages: &mut Vec<Message>) -> Option<MicrocompactReport> {
        let outcome = microcompact_messages(messages, &MicrocompactConfig::default());
        if outcome.blocks_cleared == 0 {
            return None;
        }
        Some(MicrocompactReport {
            tools_cleared: outcome.tools_cleared,
            blocks_cleared: outcome.blocks_cleared,
        })
    }
}

/// Rapport microcompact (placeholders sur anciens tool results).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MicrocompactReport {
    pub tools_cleared: usize,
    pub blocks_cleared: usize,
}

/// Rapport d'une passe de snip déclenchée par `ContextPolicy`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SnipReport {
    pub tokens_freed: usize,
    pub blocks_snipped: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::{Content, Role, ToolUseId};

    fn tool_msg(content: &str) -> Message {
        Message {
            role: Role::Tool,
            content: vec![Content::ToolResult {
                tool_use_id: ToolUseId::new(),
                content: content.into(),
                is_error: false,
            }],
        }
    }

    #[test]
    fn maybe_snip_returns_none_for_small_history() {
        let policy = ContextPolicy::default();
        let mut msgs = vec![Message::user("hi"), Message::assistant("hello")];
        assert!(policy.maybe_snip(&mut msgs).is_none());
        assert_eq!(msgs.len(), 2);
    }

    #[test]
    fn maybe_snip_rewrites_old_large_tool_results() {
        let policy = ContextPolicy::new(
            Arc::new(RoughTokenCounter::new(4)),
            ContextBudget::default(),
            Some(SnipConfig {
                min_tokens: 100,
                keep_recent_results: 1,
                placeholder: "[snip]".into(),
            }),
        );
        let big = "x".repeat(8_000);
        let mut msgs = vec![tool_msg(&big), tool_msg(&big), tool_msg(&big)];
        let report = policy.maybe_snip(&mut msgs).expect("snip should fire");
        assert_eq!(report.blocks_snipped, 2);
        // Le plus ancien doit avoir été réduit ; le plus récent conservé.
        match &msgs[0].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content, "[snip]"),
            _ => panic!("expected ToolResult"),
        }
        match &msgs[2].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content, &big),
            _ => panic!("expected ToolResult"),
        }
    }

    #[test]
    fn without_snip_disables_auto_compact() {
        let policy = ContextPolicy::default().without_snip();
        let big = "x".repeat(8_000);
        let mut msgs = vec![tool_msg(&big), tool_msg(&big)];
        assert!(policy.maybe_snip(&mut msgs).is_none());
    }

    #[test]
    fn maybe_snip_hot_keeps_four_recent_and_spills_older() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let policy = ContextPolicy::new(
            Arc::new(RoughTokenCounter::new(4)),
            ContextBudget::default(),
            Some(SnipConfig::default()),
        );
        // ~3000 tokens chacun → au-dessus de HOT_SNIP_MIN_TOKENS (2000).
        let big = "w".repeat(12_000);
        let mut msgs = vec![
            tool_msg(&big),
            tool_msg(&big),
            tool_msg(&big),
            tool_msg(&big),
            tool_msg(&big),
            tool_msg(&big),
        ];
        let report = policy
            .maybe_snip_hot(&mut msgs, Some(ws.as_ref()))
            .expect("hot snip should fire");
        // 6 results, keep 4 → 2 snipped.
        assert_eq!(report.blocks_snipped, 2);
        match &msgs[0].content[0] {
            Content::ToolResult { content, .. } => {
                assert!(
                    content.contains("SPILLED") || content.contains("tool-outputs"),
                    "older result must become a spill stub, got: {}",
                    &content[..content.len().min(120)]
                );
                // Preview 512 B max — le corps 4 KiB ne doit plus être inline.
                assert!(
                    content.len() < big.len(),
                    "stub must be shorter than original body"
                );
                assert!(!content.contains(&big));
            }
            _ => panic!("expected ToolResult"),
        }
        match &msgs[5].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content, &big),
            _ => panic!("expected ToolResult"),
        }
        let out_dir = ws.join(".drox").join("tool-outputs");
        let n = std::fs::read_dir(out_dir.as_std_path()).unwrap().count();
        assert_eq!(n, 2, "each snipped block must spill once");
    }

    #[test]
    fn maybe_snip_hot_keeps_small_results_outside_window() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let policy = ContextPolicy::new(
            Arc::new(RoughTokenCounter::new(4)),
            ContextBudget::default(),
            Some(SnipConfig::default()),
        );
        // ~250 tokens (manifest-sized) : jamais vidé par le hot snip.
        let small = "p".repeat(1_000);
        let mut msgs: Vec<Message> = (0..8).map(|_| tool_msg(&small)).collect();
        assert!(policy.maybe_snip_hot(&mut msgs, Some(ws.as_ref())).is_none());
        match &msgs[0].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content, &small),
            _ => panic!("expected ToolResult"),
        }
    }
}
