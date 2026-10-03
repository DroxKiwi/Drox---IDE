//! Config et résultat de compaction (persist + live).

use drox_types::Usage;

/// Limite d'un `tool_result` dans le condensé envoyé au modèle de compaction.
const DEFAULT_SUMMARIZE_TOOL_RESULT_TRUNCATE: usize = 300;

/// Limite par défaut d'un `tool_result` réinjecté dans la conversation à
/// résumer (persist M1). Au-delà, le bloc est tronqué.
const DEFAULT_TOOL_RESULT_TRUNCATE: usize = 800;

/// Préambule placé devant chaque `tool_result` tronqué dans le condensé.
/// Permet au modèle de compaction de **savoir** que le contenu est tronqué
/// (et donc de ne pas extrapoler ce qu'il y avait au-delà).
pub(crate) const TRUNCATE_SUFFIX: &str = "\n[... truncated for summarization ...]";

/// Configuration de la compaction.
#[derive(Debug, Clone)]
pub struct CompactionConfig {
    /// Température du modèle pendant la compaction. On veut un résumé
    /// **factuel**, pas créatif → faible. 0.0–0.2.
    pub temperature: f32,
    /// Limite de tokens de génération. Le résumé doit tenir en ~600-1500
    /// tokens : assez pour structurer plusieurs sections, pas tant que ça
    /// devienne un mini-roman.
    pub max_summary_tokens: u32,
    /// Borne sur la taille d'un `tool_result` dans le condensé **persist** M1.
    pub tool_result_truncate_chars: usize,
    /// Borne plus agressive pour le condensé du tour `summarize_run` (live).
    pub summarize_tool_result_truncate_chars: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            temperature: 0.1,
            max_summary_tokens: 1200,
            tool_result_truncate_chars: DEFAULT_TOOL_RESULT_TRUNCATE,
            summarize_tool_result_truncate_chars: DEFAULT_SUMMARIZE_TOOL_RESULT_TRUNCATE,
        }
    }
}

/// Résultat d'une compaction réussie.
#[derive(Debug, Clone)]
pub struct CompactionResult {
    /// **Objectif court** extrait du résumé (1 ligne, utile pour le
    /// front-matter et pour le listing). `String::new()` si le modèle n'a
    /// pas fourni la section attendue.
    pub objective: String,
    /// Fichiers explicitement nommés par le modèle dans la section
    /// `## Files touched` (ou `## Fichiers touchés`). Vide si absent.
    pub files_touched: Vec<String>,
    /// Body markdown brut produit par le modèle. C'est ce qui est écrit
    /// dans le `.md` persistant.
    pub summary: String,
    /// Comptage tokens du tour LLM de compaction (utile pour télémetrie).
    pub usage: Option<Usage>,
}
