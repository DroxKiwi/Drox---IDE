//! Rapports de progression outil (ex. sortie bash streamée, Explore live).

use serde_json::Value;

/// Mise à jour partielle d'un tool long (bash stdout, Explore log, …).
#[derive(Debug, Clone)]
pub struct ShellProgressUpdate {
    /// Dernières lignes affichables (souvent 5–40).
    pub output: String,
    /// Sortie cumulée complète.
    pub full_output: String,
    pub elapsed_ms: u64,
    pub total_lines: usize,
}

/// Alias sémantique : même wire que le shell (outil `task` / Explore).
pub type TextProgressUpdate = ShellProgressUpdate;

/// Sink optionnel branché par le moteur pendant l'exécution d'un tool.
pub trait ToolProgressSink: Send + Sync {
    fn report_shell(&self, update: ShellProgressUpdate);

    /// Progression texte générique (Explore, etc.) — défaut = même canal que shell.
    fn report_text(&self, update: TextProgressUpdate) {
        self.report_shell(update);
    }

    /// Outil enfant d'un sous-agent (UI only — jamais injecté dans le LLM parent).
    fn report_child_tool_start(&self, _id: &str, _name: &str, _arguments: &Value) {}

    /// Fin d'un outil enfant de sous-agent.
    fn report_child_tool_finish(&self, _id: &str, _output: &Value, _is_error: bool) {}

    /// Texte / thinking de l'enfant (notes live UI).
    fn report_child_text_delta(&self, _text: &str) {}
}
