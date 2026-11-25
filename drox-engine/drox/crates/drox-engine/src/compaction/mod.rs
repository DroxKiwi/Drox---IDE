//! Compaction — résume un run pour persistance dans `.drox/memory/sessions/`.
//!
//! Sprint M1 (architecture mémoire unifiée). La compaction est le seul
//! mécanisme qui produit un résumé : selon où on appelle [`summarize_run`],
//! ce résumé est soit
//!
//! - **persisté** (fin de run, ce module aujourd'hui) ;
//! - **réinjecté dans le contexte** pour soulager la fenêtre (à venir, M2).
//!
//! Au V1 on n'expose que l'usage « persistance ». L'usage « live »
//! (`try_live_compact`) réutilise la même fonction [`summarize_run`] sur un
//! préfixe d'historique et remplace ce préfixe par un message `system`
//! checkpoint — voir [`try_live_compact`].
//!
//! ## Pipeline
//!
//! 1. Le moteur (à `[phase: done]` réussi, run **non trivial**) appelle
//!    [`summarize_run`] avec :
//!    - le client LLM,
//!    - le prompt système de compaction (cf. `drox-cli/prompts.rs`),
//!    - l'historique complet du run,
//!    - les notes épinglées via `session_note`,
//!    - une [`CompactionConfig`] (`temperature`, `max_tokens`).
//! 2. La fonction condense l'historique en un blob textuel signé (rôle +
//!    contenu, `tool_results` tronqués si nécessaire), l'envoie au modèle avec
//!    le prompt système, et collecte le markdown produit.
//! 3. Elle ré-extrait du markdown l'`objective` (1 ligne) et la liste des
//!    `files_touched` (section dédiée) pour remplir le front-matter de la
//!    session persistée.
//!
//! Si l'extraction rate (le modèle a livré du markdown libre sans suivre
//! le format), on dégrade proprement : `objective` = première ligne non
//! vide, `files_touched` = liste vide. Le body markdown brut reste
//! sauvegardé tel quel — l'utilisateur peut toujours le lire.
//!
//! Sous-modules : [`types`], [`summarize`], [`live`], helpers privés.

mod helpers;
mod live;
mod summarize;
mod types;

#[cfg(test)]
mod tests;

pub use live::{
    choose_live_compact_split_idx, compact_until_budget, format_compact_checkpoint, try_live_compact,
    LiveCompactReport, CHECKPOINT_MAX_CHARS, LIVE_COMPACT_MAX_PASSES, LIVE_COMPACT_MAX_TAIL_RATIO,
    LIVE_COMPACT_MIN_PREFIX_TOKENS, LIVE_COMPACT_TAIL_KEEP_MESSAGES,
};
pub use summarize::summarize_run;
pub use types::{CompactionConfig, CompactionResult};
