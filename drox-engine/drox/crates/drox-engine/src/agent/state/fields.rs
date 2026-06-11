/// Marqueur du snapshot factuel run (`CTX-run-snapshot`).
pub const ARCHITECT_RUN_SNAPSHOT_MARKER: &str = "## Architect run snapshot (engine)";

/// Chemins connus issus de `workspace_map_read` (ou carte persistée).
#[derive(Debug)]
pub struct ArchitectRunState {
    pub(super) anchor_user_request_max_chars: usize,
    pub(super) anchor_plan_max_items: usize,
    pub workspace_paths: HashSet<String>,
    pub workspace_map_loaded: bool,
    /// Libellés todo (`t1` → contenu) pour le snapshot.
    pub task_labels: HashMap<String, String>,
    /// Statuts du dernier `todo_write` réussi (`id` → `pending` | `in_progress` | …).
    pub todo_statuses: HashMap<String, String>,
    /// Demande utilisateur du run (premier message `user`, non écrasable par compaction).
    pub user_request_anchor: Option<String>,
    /// Objectif verrouillé (`[run_objective: …]` ou config run).
    pub run_objective_anchor: Option<String>,
    /// Run rail conductor (1.4.0) — inactive while `run_rail_enabled` is false.
    pub rail: RunRailState,
}

impl Default for ArchitectRunState {
    fn default() -> Self {
        Self::with_engine_tuning(&crate::EngineTuning::default())
    }
}

impl ArchitectRunState {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn with_engine_tuning(tuning: &crate::EngineTuning) -> Self {
        Self {
            anchor_user_request_max_chars: tuning.anchor_user_request_max_chars as usize,
            anchor_plan_max_items: tuning.anchor_plan_max_items as usize,
            workspace_paths: HashSet::new(),
            workspace_map_loaded: false,
            task_labels: HashMap::new(),
            todo_statuses: HashMap::new(),
            user_request_anchor: None,
            run_objective_anchor: None,
            rail: RunRailState::new(),
        }
    }

    /// Mémorise la demande utilisateur initiale (idempotent — garde la première).
    pub fn anchor_user_request(&mut self, text: &str) {
        if self.user_request_anchor.is_some() {
            return;
        }
        self.set_user_request_anchor(text);
    }

    /// Remplace l'ancre demande user (ex. tour edit après gate `has_concrete_goal`).
    pub fn set_user_request_anchor(&mut self, text: &str) {
        let literal = crate::orchestration::sanitize_architect_user_prompt(text);
        let t = literal.trim();
        if !t.is_empty() {
            self.user_request_anchor =
                Some(truncate_anchor_text(t, self.anchor_user_request_max_chars));
        }
    }

    pub fn anchor_run_objective(&mut self, objective: &str) {
        let t = objective.trim();
        if !t.is_empty() {
            self.run_objective_anchor = Some(truncate_anchor_text(t, 320));
        }
    }
}

#[must_use]
fn truncate_anchor_text(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max_chars).collect();
    out.push_str("…");
    out
}
