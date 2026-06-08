//! Événements émis par la boucle agent vers son consommateur.

use drox_tools::ScopeDeferredItem;
use drox_types::{StopReason, ToolUseId, Usage};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::long_memory::ContextChunkSummaryV1;

/// Phase courante du protocole agent (Sprint A — refonte « phases + objectif »).
///
/// Le modèle est invité à structurer ses réponses comme une suite de phases ;
/// chaque transition est annoncée par une ligne `[phase: nom]` au début d'un
/// segment de réponse, parsée et **retirée** du texte assistant par
/// `consume_stream`, puis exposée à l'UI via `AgentEvent::PhaseEnter`.
///
/// L'ordre indicatif documenté pour le prompt est : `Reading → Clarifying? →
/// Planning? → (Acting → Verifying)+ → Answering → Done`. Toutes les phases
/// ne sont pas requises ; **seul `Done` est le signal de clôture exploité
/// par le moteur** (Sprint A.2 — done-driven completion). `Answering` est la
/// phase qui sépare le contenu interne (trace UI repliée) de la
/// réponse finale destinée à l'utilisateur (rendu plein dans la bulle).
///
/// Les marqueurs historiques `[phase: reasoning]` et `[phase: next-move]` sont
/// **ignorés** par le parseur (ligne consommée sans effet) pour compatibilité
/// avec d'anciens prompts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    /// Raisonnement natif du fournisseur (ex. Ollama `message.thinking`) —
    /// **non** issu des marqueurs `[phase: …]` ; émis uniquement par le moteur.
    #[serde(rename = "internal_reasoning")]
    InternalReasoning,
    /// Cartographie structurée du workspace (§2.18) — distinct du `reading` ciblé.
    Analyzing,
    Reading,
    Clarifying,
    Planning,
    Acting,
    /// Vérification exécutable après mutation de code (§2.11) — tests, build, lint.
    Testing,
    Verifying,
    Answering,
    Done,
}

impl Phase {
    /// Identifiant ASCII utilisé dans le marqueur ligne `[phase: ...]`.
    #[must_use]
    pub const fn as_marker(self) -> &'static str {
        match self {
            Self::InternalReasoning => "internal_reasoning",
            Self::Analyzing => "analyzing",
            Self::Reading => "reading",
            Self::Clarifying => "clarifying",
            Self::Planning => "planning",
            Self::Acting => "acting",
            Self::Testing => "testing",
            Self::Verifying => "verifying",
            Self::Answering => "answering",
            Self::Done => "done",
        }
    }
}

/// Événement de haut niveau émis par l'agent.
///
/// `#[non_exhaustive]` : de nouveaux variants pourront être ajoutés
/// (ex. `Thinking`, `PlanStep`, `PermissionPrompt`) sans casser l'API.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[non_exhaustive]
pub enum AgentEvent {
    /// Orchestration 1.2.0 — un rôle (architect, executor, …) démarre.
    RoleEnter {
        role_id: String,
    },
    /// Le modèle entre dans une phase (cf. protocole §`Phase`). Émis dès qu'un
    /// marqueur `[phase: ...]` est détecté en début de ligne dans le stream
    /// texte. L'UI s'en sert pour ouvrir un bloc collapsible dédié.
    PhaseEnter { phase: Phase },
    /// Ferme le bloc de phase repliable courant **sans** en ouvrir un nouveau
    /// (ex. fin du flux `thinking` Ollama avant le texte `content`).
    PhaseClose,
    /// Token(s) de texte produits par l'assistant.
    TextDelta { text: String },
    /// Réponse finale destinée à l'utilisateur (tour discussion — source canonique UI).
    UserFacingReply { text: String },
    /// Le modèle a décidé d'invoquer un tool. Émis dès la réception de la
    /// décision, avant exécution.
    ToolStart {
        id: ToolUseId,
        name: String,
        arguments: Value,
    },
    /// Résultat d'exécution d'un tool, fourni au modèle au tour suivant.
    ToolFinish {
        id: ToolUseId,
        output: Value,
        #[serde(default)]
        is_error: bool,
    },
    /// Fin du tour agent (succès final, plus aucun tool call à exécuter).
    Stop { reason: StopReason, usage: Usage },
    /// Une passe de snip a été appliquée à l'historique pour libérer du
    /// contexte. `tokens_freed` est une estimation ; `blocks_snipped` est le
    /// nombre de `tool_result` réécrits.
    ContextSnip {
        tokens_freed: usize,
        blocks_snipped: usize,
        tokens_used_after: usize,
    },
    /// Estimation jetons de l'historique **parent** (compteur moteur), émis à
    /// chaque tour pour mettre à jour la jauge IDE quasi en temps réel.
    ContextUsage {
        parent_tokens: usize,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        parent_budget: Option<usize>,
    },
    /// Compaction LLM **en cours de run** : une portion ancienne de
    /// l'historique a été résumée et remplacée par un message `system`
    /// « checkpoint » (M2 — compaction proactive). Nécessite
    /// `AgentConfig::memory` pour réutiliser le client + prompt de
    /// compaction ; sinon seul le snip synchrone s'applique.
    ContextCompacted {
        /// Estimation jetons avant réécriture.
        tokens_before: usize,
        /// Estimation jetons après réécriture.
        tokens_after: usize,
        /// Nombre de messages retirés (hors le checkpoint inséré).
        messages_removed: usize,
        /// Coût du tour LLM de compaction, si le provider l'expose.
        #[serde(default)]
        usage: Option<Usage>,
        /// Données pour indexation mémoire longue côté client (extension).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        context_chunk_summary: Option<ContextChunkSummaryV1>,
    },
    /// Sprint M1 — un résumé du run vient d'être persisté dans
    /// `.drox/memory/sessions/`. L'UI peut afficher un chip discret
    /// « Session archivée : <slug> » et proposer un lien vers le fichier.
    ///
    /// `usage` est le coût LLM du tour de compaction (input/output tokens).
    MemoryPersisted {
        /// Slug court de la session (utilisé par `memory_read`).
        slug: String,
        /// Chemin absolu du `.md` produit.
        path: String,
        /// Objectif extrait du résumé (1 ligne, identique au front-matter).
        objective: String,
        /// Coût LLM du tour de compaction. `None` si le provider n'a pas
        /// remonté de `usage` (rare).
        #[serde(default)]
        usage: Option<Usage>,
    },
    /// Sprint §2.25 — objectif verrouillé du run (heuristique côté client).
    RunObjective { text: String },
    /// Sprint §2.25 — mise à jour du parking hors scope (`scope_defer`).
    ScopeParkingUpdate { items: Vec<ScopeDeferredItem> },
    /// M5 — début d'un sous-agent (`task` explore).
    SubagentStart {
        subagent_type: String,
        description: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        job_id: Option<String>,
        #[serde(default)]
        background: bool,
    },
    /// M5 — fin d'un sous-agent (résumé synthétique pour l'UI).
    SubagentDone {
        subagent_type: String,
        summary: String,
        #[serde(default)]
        truncated: bool,
        #[serde(default)]
        iterations_used: usize,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        job_id: Option<String>,
        #[serde(default = "default_true")]
        success: bool,
        /// Orchestration 1.2.0 — `completed` | `partial` | `failed` (executor delegate).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        task_status: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error_message: Option<String>,
    },
    /// Anti-boucle — message utilisateur (`warn` | `reroute` | `abort`).
    LoopIntervention {
        level: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        loop_kind: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        turns: Option<u32>,
        user_message: String,
    },
    /// Run rail 1.4 — entered a new station (`advance`).
    RailStationEnter {
        station: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        task_id: Option<String>,
    },
    /// Run rail 1.4 — `hold` (PROPOSE user wait or jump to ANSWER).
    RailStationHold {
        station: String,
    },
    /// Run rail 1.4 — left a station (`advance` or `hold` follow-up).
    RailStationDone {
        station: String,
    },
    /// Run rail 1.4 — ACT segment spawned (isolated executor slice).
    RailSegmentStart {
        station: String,
        task_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
        scope: Vec<String>,
    },
    /// Run rail 1.4 — ACT segment report integrated.
    RailSegmentDone {
        task_id: String,
        status: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        summary: Option<String>,
        paths_touched: Vec<String>,
    },
}

impl AgentEvent {
    /// Événements qui mettent à jour la jauge `#ctx` IDE — réservés au run **parent** (architecte).
    #[must_use]
    pub fn is_parent_context_gauge(&self) -> bool {
        matches!(
            self,
            Self::ContextUsage { .. } | Self::ContextSnip { .. } | Self::ContextCompacted { .. }
        )
    }
}

#[must_use]
fn default_true() -> bool {
    true
}
