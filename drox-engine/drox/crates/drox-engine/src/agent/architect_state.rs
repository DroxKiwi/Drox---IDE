//! État orchestration architecte (1.2.0) — une struct par run, pas des champs éparpillés.

use std::collections::{HashMap, HashSet};

use drox_tools::{
    ArchitectHelpSnapshot, ArchitectHelpTodoItem, new_orchestration_plan_id,
};
use drox_types::{Content, Message, Role};
use serde_json::Value;

use crate::compaction::is_context_checkpoint_message;
use crate::orchestration::{
    ask_payload_declares_cycle_user_check, delegate_payload_is_sanity_task,
    is_meta_synthesis_task,
};

use super::cycle_sanity::{
    CycleSanityOutcome, cycle_sanity_failed_summary, infer_sanity_from_delegate_output,
};
use super::architect_todo_gate;
use crate::orchestration::{extract_mode_from_text, ArchitectWorkMode, DelegateStatus};

/// Marqueur legacy (transcripts / compaction anciens).
pub const ARCHITECT_CYCLE_ANCHOR_MARKER: &str = "## Architect cycle anchor (engine)";

/// Marqueur du snapshot factuel run (`CTX-run-snapshot`).
pub const ARCHITECT_RUN_SNAPSHOT_MARKER: &str = "## Architect run snapshot (engine)";

/// Chemins connus issus de `workspace_map_read` (ou carte persistée).
#[derive(Debug)]
pub struct ArchitectRunState {
    anchor_user_request_max_chars: usize,
    anchor_plan_max_items: usize,
    pub workspace_paths: HashSet<String>,
    pub workspace_map_loaded: bool,
    pub reads_since_delegate: usize,
    /// `file_edit` / `file_write` directs depuis la dernière délégation.
    pub mutations_since_delegate: usize,
    /// Nudge lecture (cap preset) déjà injecté depuis la dernière délégation.
    pub delegate_reads_nudge_sent: bool,
    /// Nudge mutation (cap preset) déjà injecté depuis la dernière délégation.
    pub delegate_mutations_nudge_sent: bool,
    pub delegate_counts: HashMap<String, u32>,
    pub verified_task_ids: HashSet<String>,
    /// Scope par tâche (batch `parallel_with` — verify ciblée hors `last_delegate`).
    pub task_delegate_scopes: HashMap<String, Vec<String>>,
    /// Dernier statut exécuteur par `task_id`.
    pub task_delegate_status: HashMap<String, DelegateStatus>,
    pub last_delegate_task_id: Option<String>,
    pub last_delegate_scope: Vec<String>,
    pub last_delegate_status: Option<DelegateStatus>,
    /// Dossier parent des livrables exécuteur (`.drox/agent-output/<plan_id>/`).
    pub orchestration_plan_id: Option<String>,
    /// Libellés todo (`t1` → contenu) pour nommer les livrables.
    pub task_labels: HashMap<String, String>,
    /// Statuts du dernier `todo_write` réussi (`id` → `pending` | `in_progress` | …).
    pub todo_statuses: HashMap<String, String>,
    /// Dernier paquet d'échec structuré (`delegate_executor` → `failure`).
    pub last_failure: Option<Value>,
    /// Vérité terrain OK sur la dernière délégation.
    pub last_delegate_verified: bool,
    /// Nudge `run_closable` déjà injecté ce run.
    pub run_closable_nudge_sent: bool,
    /// Vérification globale « le projet fonctionne encore » avant clôture.
    pub cycle_sanity: CycleSanityOutcome,
    /// Nudge fin de cycle (smoke test) déjà envoyé.
    pub cycle_sanity_nudge_sent: bool,
    /// Résumé court si `cycle_sanity == Failed` (pour checkpoint / answering).
    pub cycle_sanity_note: Option<String>,
    /// Tours consécutifs avec `[phase: done]` sans clôture.
    pub consecutive_done_without_close: u32,
    /// Demande utilisateur du run (premier message `user`, non écrasable par compaction).
    pub user_request_anchor: Option<String>,
    /// Objectif verrouillé (`[run_objective: …]` ou config run).
    pub run_objective_anchor: Option<String>,
    /// Sous-mode déclaré par le modèle (`[mode: discovery|task]`) — première déclaration conservée.
    pub work_mode_anchor: Option<ArchitectWorkMode>,
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
            reads_since_delegate: 0,
            mutations_since_delegate: 0,
            delegate_reads_nudge_sent: false,
            delegate_mutations_nudge_sent: false,
            delegate_counts: HashMap::new(),
            verified_task_ids: HashSet::new(),
            task_delegate_scopes: HashMap::new(),
            task_delegate_status: HashMap::new(),
            last_delegate_task_id: None,
            last_delegate_scope: Vec::new(),
            last_delegate_status: None,
            orchestration_plan_id: None,
            task_labels: HashMap::new(),
            todo_statuses: HashMap::new(),
            last_failure: None,
            last_delegate_verified: false,
            run_closable_nudge_sent: false,
            cycle_sanity: CycleSanityOutcome::default(),
            cycle_sanity_nudge_sent: false,
            cycle_sanity_note: None,
            consecutive_done_without_close: 0,
            user_request_anchor: None,
            run_objective_anchor: None,
            work_mode_anchor: None,
        }
    }

    /// Alloue un nouveau `plan_id` (premier `todo_write` ou nouveau plan).
    /// La carte workspace reste valide pour toute la session (pas de re-`workspace_map_read` forcé).
    pub fn start_new_plan(&mut self) {
        let plan_id = new_orchestration_plan_id();
        tracing::info!(
            plan_id = %plan_id,
            "drox: orchestration plan output directory id assigned"
        );
        self.orchestration_plan_id = Some(plan_id);
        self.task_labels.clear();
        self.verified_task_ids.clear();
        self.delegate_counts.clear();
        self.task_delegate_scopes.clear();
        self.task_delegate_status.clear();
        self.last_delegate_task_id = None;
        self.last_delegate_status = None;
        self.last_delegate_scope.clear();
        self.reads_since_delegate = 0;
        self.mutations_since_delegate = 0;
        self.delegate_reads_nudge_sent = false;
        self.delegate_mutations_nudge_sent = false;
    }

    /// Mémorise le `scope` d'une tâche avant `delegate_executor` (primaire ou `parallel_with`).
    pub fn set_task_delegate_scope(&mut self, task_id: &str, scope: Vec<String>) {
        let paths: Vec<String> = scope
            .into_iter()
            .map(|s| normalize_workspace_path(&s))
            .filter(|s| !s.is_empty())
            .collect();
        if paths.is_empty() {
            return;
        }
        self.task_delegate_scopes.insert(task_id.to_string(), paths);
    }

    /// Garantit un `plan_id` actif après un `todo_write` architecte réussi.
    pub fn ensure_plan_id_on_todo_write(&mut self, is_fresh_plan: bool) {
        if is_fresh_plan || self.orchestration_plan_id.is_none() {
            self.start_new_plan();
        }
    }

    #[must_use]
    pub fn agent_output_path_for_task(&self, task_id: &str) -> String {
        let plan = self
            .orchestration_plan_id
            .as_deref()
            .unwrap_or("plan_unknown");
        let label = self
            .task_labels
            .get(task_id)
            .map(String::as_str)
            .unwrap_or(task_id);
        drox_tools::agent_output_deliverable_path(plan, task_id, label)
    }

    /// Ingère les libellés `content` depuis une réponse `todo_write` réussie.
    pub fn ingest_todo_labels(&mut self, output: &Value) {
        let Some(todos) = output.get("todos").and_then(|v| v.as_array()) else {
            return;
        };
        for item in todos {
            let Some(id) = item.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let id = id.trim();
            if id.is_empty() {
                continue;
            }
            let content = item
                .get("content")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty());
            if let Some(label) = content {
                self.task_labels.insert(id.to_string(), label.to_string());
            }
            if let Some(status) = item.get("status").and_then(|v| v.as_str()) {
                self.todo_statuses
                    .insert(id.to_string(), status.trim().to_string());
            }
        }
    }

    /// Ingère les chemins `nodes[].path` d'une réponse `workspace_map_read`.
    pub fn ingest_workspace_map_output(&mut self, output: &Value) {
        self.workspace_map_loaded = true;
        self.workspace_paths.clear();
        let Some(nodes) = output.get("nodes").and_then(|v| v.as_array()) else {
            return;
        };
        for node in nodes {
            if let Some(path) = node.get("path").and_then(|v| v.as_str()) {
                let p = normalize_workspace_path(path);
                if !p.is_empty() {
                    self.workspace_paths.insert(p);
                }
            }
        }
    }

    /// Met à jour l'état après un `delegate_executor` réussi (résultat outil JSON).
    pub fn record_delegate_result(&mut self, output: &Value, _workspace: &camino::Utf8Path) {
        if output.get("batch").and_then(|v| v.as_bool()) == Some(true) {
            if let Some(results) = output.get("results").and_then(|v| v.as_array()) {
                for item in results {
                    self.record_delegate_result_single(item);
                }
                return;
            }
        }
        self.record_delegate_result_single(output);
    }

    fn record_delegate_result_single(&mut self, output: &Value) {
        let task_id = output
            .get("taskId")
            .or_else(|| output.get("task_id"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let status_str = output
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("partial");
        let status = match status_str {
            "completed" => DelegateStatus::Completed,
            "failed" => DelegateStatus::Failed,
            "blocked" => DelegateStatus::Blocked,
            _ => DelegateStatus::Partial,
        };
        let wire_verified = output
            .get("verified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        self.last_failure = output.get("failure").cloned().filter(|v| !v.is_null());
        self.last_delegate_verified = wire_verified;
        self.last_delegate_task_id = task_id.clone();
        self.last_delegate_status = Some(status);
        if let Some(ref id) = task_id {
            self.task_delegate_status.insert(id.clone(), status);
            if wire_verified || status == DelegateStatus::Completed {
                self.verified_task_ids.insert(id.clone());
            } else {
                self.verified_task_ids.remove(id);
            }
        }
    }

    pub fn set_pending_delegate_scope(&mut self, scope: Option<Vec<String>>) {
        self.last_delegate_scope = scope
            .unwrap_or_default()
            .into_iter()
            .map(|s| normalize_workspace_path(&s))
            .filter(|s| !s.is_empty())
            .collect();
    }

    /// Union des `scope` d'un appel `delegate_executor` (`tasks[]` ou scope racine).
    #[must_use]
    pub fn aggregate_delegate_scopes_from_arguments(arguments: &Value) -> Vec<String> {
        let mut out: Vec<String> = arguments
            .get("scope")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str())
            .map(|s| normalize_workspace_path(s))
            .filter(|s| !s.is_empty())
            .collect();
        if let Some(tasks) = arguments.get("tasks").and_then(|v| v.as_array()) {
            for item in tasks {
                if let Some(scope) = item.get("scope").and_then(|v| v.as_array()) {
                    for p in scope {
                        if let Some(s) = p.as_str() {
                            let n = normalize_workspace_path(s);
                            if !n.is_empty() && !out.iter().any(|e| e == &n) {
                                out.push(n);
                            }
                        }
                    }
                }
            }
        }
        out
    }

    /// Marque les tâches vérifiées après un read-only ciblé sur le scope.
    /// Retourne les `task_id` nouvellement marqués.
    pub fn try_mark_verified(&mut self, tool_name: &str, arguments: &Value) -> Vec<String> {
        let Some(path) = verification_path_from_tool_args(tool_name, arguments) else {
            return Vec::new();
        };
        self.try_mark_verified_path_collect(&path)
    }

    /// True si `query_path` (grep path/glob, file_read, …) touche le scope d'une tâche déléguée non vérifiée.
    #[must_use]
    pub fn path_matches_any_unverified_delegate_scope(&self, query_path: &str) -> bool {
        let query = normalize_workspace_path(query_path);
        if query.is_empty() {
            return false;
        }
        for (task_id, scopes) in &self.task_delegate_scopes {
            if self.verified_task_ids.contains(task_id) {
                continue;
            }
            let Some(status) = self.task_delegate_status.get(task_id).copied() else {
                continue;
            };
            if !matches!(
                status,
                DelegateStatus::Completed | DelegateStatus::Partial
            ) {
                continue;
            }
            if scopes.is_empty() {
                return true;
            }
            if scopes.iter().any(|scope| path_matches_scope(scope, &query)) {
                return true;
            }
        }
        if self.path_in_delegate_scope(query_path) {
            if let Some(task_id) = self.last_delegate_task_id.as_ref() {
                if !self.verified_task_ids.contains(task_id) {
                    return matches!(
                        self.last_delegate_status,
                        Some(DelegateStatus::Completed) | Some(DelegateStatus::Partial)
                    );
                }
            }
        }
        false
    }

    fn try_mark_verified_path_collect(&mut self, raw_path: &str) -> Vec<String> {
        let path = normalize_workspace_path(raw_path);
        if path.is_empty() {
            return Vec::new();
        }
        let mut newly = Vec::new();
        for (task_id, scopes) in &self.task_delegate_scopes {
            if self.verified_task_ids.contains(task_id) {
                continue;
            }
            let Some(status) = self.task_delegate_status.get(task_id).copied() else {
                continue;
            };
            if !matches!(
                status,
                DelegateStatus::Completed | DelegateStatus::Partial
            ) {
                continue;
            }
            let in_scope = scopes.is_empty()
                || scopes.iter().any(|scope| path_matches_scope(scope, &path));
            if in_scope {
                self.verified_task_ids.insert(task_id.clone());
                newly.push(task_id.clone());
            }
        }
        if !newly.is_empty() {
            return newly;
        }
        let Some(task_id) = self.last_delegate_task_id.clone() else {
            return newly;
        };
        if !matches!(
            self.last_delegate_status,
            Some(DelegateStatus::Completed) | Some(DelegateStatus::Partial)
        ) {
            return newly;
        }
        if self.path_in_delegate_scope(raw_path) && !self.verified_task_ids.contains(&task_id) {
            self.verified_task_ids.insert(task_id.clone());
            newly.push(task_id);
        }
        newly
    }

    /// Ingère les chemins matchés par `grep` pour auto-vérifier une délégation `partial`.
    pub fn try_mark_verified_from_grep_output(&mut self, output: &Value) -> Vec<String> {
        let Some(matches) = output.get("matches").and_then(|v| v.as_array()) else {
            return Vec::new();
        };
        let mut newly = Vec::new();
        for m in matches {
            let Some(p) = m.get("path").and_then(|v| v.as_str()) else {
                continue;
            };
            for id in self.try_mark_verified_path_collect(p) {
                if !newly.contains(&id) {
                    newly.push(id);
                }
            }
        }
        newly
    }

    /// Mémorise la demande utilisateur initiale (idempotent — garde la première).
    pub fn anchor_user_request(&mut self, text: &str) {
        if self.user_request_anchor.is_some() {
            return;
        }
        self.set_user_request_anchor(text);
    }

    /// Remplace l’ancre demande user (ex. tour edit après gate `has_concrete_goal`).
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

    /// Mémorise `[mode: discovery|task]` depuis une réponse assistant (idempotent).
    pub fn try_anchor_work_mode_from_text(&mut self, text: &str) {
        if self.work_mode_anchor.is_some() {
            return;
        }
        if let Some(mode) = extract_mode_from_text(text) {
            self.work_mode_anchor = Some(mode);
        }
    }

    /// Snapshot pour l'outil `architect_help` (état courant du run).
    #[must_use]
    pub fn architect_help_snapshot(&self, live_run_objective: Option<&str>) -> ArchitectHelpSnapshot {
        let mut ids: Vec<String> = self
            .task_labels
            .keys()
            .chain(self.todo_statuses.keys())
            .cloned()
            .collect();
        ids.sort();
        ids.dedup();
        let todo_items = ids
            .into_iter()
            .map(|id| ArchitectHelpTodoItem {
                label: self
                    .task_labels
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| id.clone()),
                status: self
                    .todo_statuses
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| "pending".to_string()),
                id,
            })
            .collect();
        ArchitectHelpSnapshot {
            user_request: self.user_request_anchor.clone(),
            work_mode: self.work_mode_anchor.map(ArchitectWorkMode::as_str).map(str::to_string),
            run_objective: live_run_objective
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| self.run_objective_anchor.clone()),
            run_closable: self.run_closable(),
            run_fully_closable: self.run_fully_closable(),
            cycle_sanity: self.cycle_sanity.as_str().to_string(),
            plan_id: self.orchestration_plan_id.clone(),
            todo_items,
            last_delegate_task_id: self.last_delegate_task_id.clone(),
            last_delegate_status: self
                .last_delegate_status
                .map(|s| s.as_str().to_string()),
            last_delegate_verified: self.last_delegate_verified,
            verified_task_ids: self.verified_task_ids.iter().cloned().collect(),
            reads_since_delegate: self.reads_since_delegate,
            workspace_map_loaded: self.workspace_map_loaded,
        }
    }

    /// Bloc post-compaction (checkpoint complet) — délégué au snapshot unifié.
    #[must_use]
    pub fn cycle_anchor_block(&self, live_run_objective: Option<&str>) -> String {
        crate::orchestration::architect_run_context_block_compaction(
            self,
            live_run_objective,
        )
    }

    /// Plan / todos pour le snapshot (≤ `anchor_plan_max_items` lignes).
    #[must_use]
    pub(crate) fn format_plan_snapshot_public(&self) -> String {
        self.format_plan_snapshot()
    }

    /// Tâche courante : première `in_progress` hors meta, sinon dernier `task_id` délégué.
    #[must_use]
    pub(crate) fn current_focus_task_line(&self) -> Option<(String, String, String)> {
        for (id, status) in &self.todo_statuses {
            if status == "in_progress" && !self.is_meta_synthesis_task(id) {
                let label = self
                    .task_labels
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| id.clone());
                return Some((id.clone(), label, status.clone()));
            }
        }
        self.last_delegate_task_id.as_ref().map(|id| {
            let status = self
                .todo_statuses
                .get(id)
                .cloned()
                .unwrap_or_else(|| "in_progress".to_string());
            let label = self
                .task_labels
                .get(id)
                .cloned()
                .unwrap_or_else(|| id.clone());
            (id.clone(), label, status)
        })
    }

    /// Résumé court de la dernière délégation (sans tableau checkpoint).
    #[must_use]
    pub(crate) fn format_last_delegate_snapshot(&self) -> String {
        let task = self
            .last_delegate_task_id
            .as_deref()
            .unwrap_or("(none)");
        let status = self
            .last_delegate_status
            .map(|s| s.as_str())
            .unwrap_or("unknown");
        let scope = if self.last_delegate_scope.is_empty() {
            "(none)".to_string()
        } else {
            self.last_delegate_scope
                .iter()
                .take(3)
                .map(|p| format!("`{p}`"))
                .collect::<Vec<_>>()
                .join(", ")
        };
        let verified = if self.last_delegate_verified {
            "yes"
        } else if self
            .last_delegate_task_id
            .as_ref()
            .is_some_and(|id| self.verified_task_ids.contains(id))
        {
            "yes (architect)"
        } else {
            "no"
        };
        format!(
            "> task **{task}** · status **{status}** · verified **{verified}** · scope {scope}"
        )
    }

    #[must_use]
    fn format_plan_snapshot(&self) -> String {
        if self.task_labels.is_empty() && self.todo_statuses.is_empty() {
            return "*(no plan yet — call `todo_write` before `delegate_executor`)*".to_string();
        }
        let mut ids: Vec<String> = self
            .task_labels
            .keys()
            .chain(self.todo_statuses.keys())
            .cloned()
            .collect();
        ids.sort();
        ids.dedup();
        let mut out = String::new();
        for (i, id) in ids.iter().enumerate() {
            if i >= self.anchor_plan_max_items {
                out.push_str("\n- … (plan truncated)");
                break;
            }
            let status = self
                .todo_statuses
                .get(id)
                .map(String::as_str)
                .unwrap_or("pending");
            let label = self.task_labels.get(id).map(String::as_str).unwrap_or(id);
            let verified = if self.verified_task_ids.contains(id) {
                " · verified"
            } else {
                ""
            };
            let _ = std::fmt::Write::write_fmt(
                &mut out,
                format_args!("\n- **{id}** [{status}]{verified} — {label}"),
            );
        }
        if let Some(plan) = self.orchestration_plan_id.as_deref() {
            out.push_str(&format!(
                "\n\nPlan output folder: `.drox/agent-output/{plan}/<task_id>/`"
            ));
        }
        out.trim_start_matches('\n').to_string()
    }

    /// Checkpoint injecté après compaction / délégation pour garder le fil architecte.
    #[must_use]
    pub fn cycle_checkpoint_block(&self) -> String {
        let task = self
            .last_delegate_task_id
            .as_deref()
            .unwrap_or("(none)");
        let status = self
            .last_delegate_status
            .map(|s| s.as_str())
            .unwrap_or("unknown");
        let scope = if self.last_delegate_scope.is_empty() {
            "(none)".to_string()
        } else {
            self.last_delegate_scope
                .iter()
                .take(3)
                .map(|p| format!("`{p}`"))
                .collect::<Vec<_>>()
                .join(", ")
        };
        let verified = if self.last_delegate_verified {
            "yes (engine truth-check)"
        } else if self
            .last_delegate_task_id
            .as_ref()
            .is_some_and(|id| self.verified_task_ids.contains(id))
        {
            "yes (architect verify)"
        } else {
            "no — optional spot-check or read deliverable `.md`"
        };
        let plan = self
            .orchestration_plan_id
            .as_deref()
            .unwrap_or("(no plan id yet)");
        let output_path = self
            .last_delegate_task_id
            .as_ref()
            .map(|task| self.agent_output_path_for_task(task))
            .unwrap_or_else(|| ".drox/agent-output/<plan_id>/<task_id>/<task-title>.md".to_string());
        let mut block = format!(
            "## Architect cycle checkpoint (engine)\n\
             - Plan output id: **{plan}** (all executor `.md` files live under `.drox/agent-output/{plan}/<task_id>/`)\n\
             - Last delegation: **{task}** · status **{status}** · verified: **{verified}**\n\
             - Scope: {scope}\n\
             - Follow the **User request** and **Current plan** in the cycle anchor above — shard large tasks, never refuse.\n\
             - After `partial`: read `{output_path}` or spot-check scope; re-delegate or update todos when ready.\n\
             - **You:** full edit/bash tools; **sub-agents** optional for parallel shards (`delegate_executor`)."
        );
        let mut task_ids: Vec<&str> = self.todo_statuses.keys().map(String::as_str).collect();
        task_ids.sort_unstable();
        if !task_ids.is_empty() {
            let mut rows = String::from(
                "\n\n### Todo checkpoint table\n\
                 | task_id | delegated_count | verified | last_status | suggested_next |\n\
                 |---|---:|---|---|---|\n",
            );
            for id in task_ids {
                let delegated_count = self.delegate_counts.get(id).copied().unwrap_or(0);
                let verified_flag = if self.verified_task_ids.contains(id) {
                    "yes"
                } else {
                    "no"
                };
                let last_status = self
                    .todo_statuses
                    .get(id)
                    .map(String::as_str)
                    .unwrap_or("unknown");
                let suggested_next = match last_status {
                    "completed" if verified_flag == "yes" => "none",
                    "completed" => "optional: read deliverable or spot-check",
                    "in_progress" if delegated_count == 0 => {
                        "consider `delegate_executor` (sub-agent)"
                    }
                    "in_progress" => "read deliverable; update todo when satisfied",
                    "pending" => "delegate or mark `in_progress`",
                    "cancelled" => "none",
                    _ => "update `todo_write` if tracking plan",
                };
                rows.push_str(&format!(
                    "| `{id}` | {delegated_count} | {verified_flag} | `{last_status}` | {suggested_next} |\n"
                ));
            }
            block.push_str(&rows);
        }
        if let Some(sanity) = self.cycle_sanity_pending_block() {
            block.push_str("\n\n");
            block.push_str(&sanity);
        } else if self.cycle_sanity == CycleSanityOutcome::Failed {
            if let Some(note) = self.cycle_sanity_note.as_deref() {
                block.push_str("\n\n## Cycle sanity — FAILED (engine)\n");
                block.push_str(&format!("- Summary: {note}\n"));
                block.push_str(
                    "- In `[phase: answering]`, tell the user what failed and offer fix hints — do not close as success.\n",
                );
            }
        } else if self.cycle_sanity == CycleSanityOutcome::UserDelegated {
            block.push_str(
                "\n\n## Cycle sanity — user verification requested (engine)\n\
                 - You asked the user to verify manually. In `[phase: answering]`, summarize what they should check.\n",
            );
        }
        if !self.last_delegate_verified {
            if let Some(ref failure) = self.last_failure {
                block.push_str("\n\n");
                block.push_str(&recovery_block_from_failure(
                    task,
                    status,
                    failure,
                    self.delegate_counts
                        .get(
                            self.last_delegate_task_id
                                .as_deref()
                                .unwrap_or(task),
                        )
                        .copied()
                        .unwrap_or(1),
                ));
            }
        }
        block
    }

    #[must_use]
    pub fn path_in_delegate_scope(&self, path: &str) -> bool {
        if self.last_delegate_scope.is_empty() {
            return true;
        }
        let path = normalize_workspace_path(path);
        if path.is_empty() {
            return false;
        }
        self.last_delegate_scope
            .iter()
            .any(|scope| path_matches_scope(scope, &path))
    }

    /// Tâche de synthèse / résumé — pas de `delegate_executor` requis.
    #[must_use]
    pub fn is_meta_synthesis_task(&self, task_id: &str) -> bool {
        let content = self.task_labels.get(task_id).map(String::as_str);
        is_meta_synthesis_task(task_id, content)
    }

    /// Toutes les tâches de travail (hors meta) sont terminées (`completed` ou `cancelled`).
    #[must_use]
    pub fn all_work_tasks_terminal(&self) -> bool {
        for (id, status) in &self.todo_statuses {
            if self.is_meta_synthesis_task(id) {
                continue;
            }
            if !matches!(status.as_str(), "completed" | "cancelled") {
                return false;
            }
        }
        true
    }

    /// Toutes les tâches de travail (hors meta) sont `completed` et vérifiées.
    #[must_use]
    pub fn all_work_tasks_verified(&self) -> bool {
        for (id, status) in &self.todo_statuses {
            if status != "completed" {
                continue;
            }
            if self.is_meta_synthesis_task(id) {
                continue;
            }
            if !self.verified_task_ids.contains(id) {
                return false;
            }
        }
        true
    }

    #[must_use]
    pub fn cycle_sanity_resolved(&self) -> bool {
        !matches!(self.cycle_sanity, CycleSanityOutcome::Pending)
    }

    /// Run architecte prêt pour `[phase: answering]` + `[phase: done]` (tâches terminées).
    #[must_use]
    pub fn run_closable(&self) -> bool {
        if self.todo_statuses.is_empty() {
            return false;
        }
        let all_terminal = self.todo_statuses.values().all(|s| {
            matches!(s.as_str(), "completed" | "cancelled")
        });
        if !all_terminal {
            return false;
        }
        self.all_work_tasks_verified()
    }

    /// Plan terminé **et** vérification globale (smoke / utilisateur) effectuée.
    #[must_use]
    pub fn run_fully_closable(&self) -> bool {
        self.run_closable() && self.cycle_sanity_resolved()
    }

    /// Après un outil réussi quand le plan est closable — enregistre le résultat sanity.
    pub fn observe_cycle_sanity_tool(&mut self, tool_name: &str, arguments: &Value, output: &Value) {
        if !self.run_closable() || self.cycle_sanity_resolved() {
            return;
        }
        match tool_name {
            "ask_user_question" if ask_payload_declares_cycle_user_check(arguments) => {
                self.cycle_sanity = CycleSanityOutcome::UserDelegated;
            }
            "delegate_executor" if delegate_payload_is_sanity_task(arguments) => {
                if let Some(outcome) = infer_sanity_from_delegate_output(output) {
                    self.cycle_sanity = outcome;
                    if outcome == CycleSanityOutcome::Failed {
                        self.cycle_sanity_note = Some(cycle_sanity_failed_summary(output));
                    }
                }
            }
            _ => {}
        }
    }

    /// Bloc injecté dans le checkpoint quand la sanity est encore en attente.
    #[must_use]
    pub fn cycle_sanity_pending_block(&self) -> Option<String> {
        if !self.run_closable() || self.cycle_sanity_resolved() {
            return None;
        }
        Some(
            "## Cycle sanity check (engine suggestion)\n\
             All plan tasks are `completed` — consider confirming the project still works \
             before `[phase: answering]`.\n\
             - **If you can:** one `delegate_executor` with a **smoke command** for this stack \
             (`npm test`, `cargo test`, `pytest`, build, lint — pick what matches the repo). \
             Use `task_id` `sanity` or say so in `instructions`.\n\
             - **If you cannot** (repo too large, unknown tech, no safe command): `ask_user_question` \
             asking the user to run a specific check and report back.\n\
             - **If smoke fails:** `[phase: answering]` must state what broke and give **concrete fix hints** \
             (paths, likely cause, next steps) — do not pretend success.\n\
             - **If smoke passes:** proceed to user summary, then `[phase: done]`.\n\
             Call `architect_help { \"topic\": \"sanity\" }` for the playbook."
                .to_string(),
        )
    }

    /// Gate `todo_write` → `completed` : exige d'abord `delegate_executor`, puis verify.
    #[must_use]
    pub fn complete_gate_for_task(&self, task_id: &str) -> Option<String> {
        architect_todo_gate::complete_gate_for_task(self, task_id)
    }

    #[must_use]
    pub fn needs_compensation_block(&self) -> bool {
        let Some(status) = self.last_delegate_status else {
            return false;
        };
        if !matches!(
            status,
            DelegateStatus::Partial | DelegateStatus::Failed | DelegateStatus::Blocked
        ) {
            return false;
        }
        // Une fois la tâche vérifiée, lever le mode compensation (partial/failed).
        if matches!(status, DelegateStatus::Partial | DelegateStatus::Failed) {
            if let Some(ref id) = self.last_delegate_task_id {
                if self.verified_task_ids.contains(id) {
                    return false;
                }
            }
        }
        true
    }

    /// Après `blocked`, l'architecte peut `glob` + `todo_write` pour découper le plan.
    #[must_use]
    pub fn needs_replan_after_blocked(&self) -> bool {
        matches!(self.last_delegate_status, Some(DelegateStatus::Blocked))
    }

    /// Délégation terminée (`completed` / `partial`) mais pas encore vérifiée (hors meta).
    #[must_use]
    pub fn has_unverified_work_delegate(&self) -> bool {
        for (task_id, status) in &self.task_delegate_status {
            if self.is_meta_synthesis_task(task_id) {
                continue;
            }
            if matches!(
                status,
                DelegateStatus::Completed | DelegateStatus::Partial
            ) && !self.verified_task_ids.contains(task_id)
            {
                return true;
            }
        }
        false
    }

    #[must_use]
    pub fn has_work_todo_in_progress(&self) -> bool {
        self.todo_statuses.iter().any(|(id, s)| {
            s == "in_progress" && !self.is_meta_synthesis_task(id)
        })
    }

    #[must_use]
    pub fn has_work_todo_pending(&self) -> bool {
        self.todo_statuses.iter().any(|(id, s)| {
            s == "pending" && !self.is_meta_synthesis_task(id)
        })
    }
}

/// Rafraîchit le snapshot en fin d'historique (chaque tour edit, après suppléments E/T).
pub fn refresh_architect_run_snapshot(messages: &mut Vec<Message>, snapshot: &str) {
    messages.retain(|m| !is_architect_run_snapshot_message(m));
    messages.push(Message::system(snapshot.to_string()));
}

/// Post-compaction / `todo_write` : une seule copie du snapshot après le checkpoint.
pub fn inject_architect_run_snapshot_after_checkpoint(
    messages: &mut Vec<Message>,
    snapshot: &str,
) {
    messages.retain(|m| !is_architect_run_snapshot_message(m));
    let insert_at = messages
        .iter()
        .position(is_context_checkpoint_message)
        .map(|i| i + 1)
        .unwrap_or_else(|| {
            messages
                .iter()
                .take_while(|m| matches!(m.role, Role::System))
                .count()
                .max(1)
        });
    messages.insert(insert_at, Message::system(snapshot.to_string()));
}

#[must_use]
pub fn is_architect_run_snapshot_message(m: &Message) -> bool {
    if !matches!(m.role, Role::System) {
        return false;
    }
    let text = system_message_text(m);
    text.contains(ARCHITECT_RUN_SNAPSHOT_MARKER) || text.contains(ARCHITECT_CYCLE_ANCHOR_MARKER)
}

#[must_use]
fn system_message_text(m: &Message) -> String {
    if matches!(m.role, Role::System) {
        Content::collapse_text(&m.content)
    } else {
        String::new()
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

#[must_use]
pub fn normalize_workspace_path(path: &str) -> String {
    let mut p = path.trim();
    if let Some(rest) = p.strip_prefix(r"\\?\") {
        p = rest;
    }
    p.replace('\\', "/").trim().trim_matches('/').to_string()
}

/// True si `path` (relatif ou absolu Windows) correspond à une entrée `scope`.
#[must_use]
pub fn path_matches_scope(scope: &str, path: &str) -> bool {
    let scope = normalize_workspace_path(scope);
    let path = normalize_workspace_path(path);
    if scope.is_empty() || path.is_empty() {
        return false;
    }
    if path == scope {
        return true;
    }
    // Chemin absolu Windows / préfixe workspace : …/scope/… ou …/scope
    if path.contains(&format!("/{scope}/")) || path.ends_with(&format!("/{scope}")) {
        return true;
    }
    // `grep` / `glob` avec répertoire parent (ex. scope fichier + path dossier).
    if scope.starts_with(&format!("{path}/")) || path.starts_with(&format!("{scope}/")) {
        return true;
    }
    if path.ends_with(&format!("/{scope}")) {
        return true;
    }
    if scope.ends_with('/') {
        return path.starts_with(&scope) || path.starts_with(scope.trim_end_matches('/'));
    }
    let scope_base = scope.rsplit('/').next().unwrap_or(&scope);
    let path_base = path.rsplit('/').next().unwrap_or(&path);
    scope_base == path_base
}

#[must_use]
fn verification_path_from_tool_args(tool_name: &str, arguments: &Value) -> Option<String> {
    match tool_name {
        "file_read" | "lsp" => arguments
            .get("path")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        "grep" => arguments
            .get("path")
            .or_else(|| arguments.get("glob"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        "glob" => arguments
            .get("path")
            .or_else(|| arguments.get("pattern"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        _ => None,
    }
}

#[must_use]
fn recovery_block_from_failure(
    task_id: &str,
    status: &str,
    failure: &Value,
    delegate_attempts: u32,
) -> String {
    let mut block = format!(
        "## Architect — delegate recovery (task `{task_id}`)\n\
         Last delegate: **{status}** — spot-check or re-delegate suggested (engine verified: **no**).\n"
    );
    if let Some(s) = failure.get("summary").and_then(|v| v.as_str()) {
        block.push_str(&format!("- Failure: {s}\n"));
    }
    if let Some(paths) = failure.get("scopeChecked").and_then(|v| v.as_array()) {
        block.push_str("- Scope on disk:\n");
        for entry in paths.iter().take(5) {
            let path = entry
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let exists = entry
                .get("exists")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let bytes = entry.get("bytes").and_then(|v| v.as_u64()).unwrap_or(0);
            let flag = if exists { "OK" } else { "MISSING" };
            block.push_str(&format!("  - `{path}` — {flag} ({bytes} B)\n"));
        }
    }
    if let Some(p) = failure.get("agentOutput").and_then(|v| v.as_str()) {
        let bytes = failure
            .get("agentOutputBytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        block.push_str(&format!("- Agent-output: `{p}` ({bytes} B)\n"));
    }
    if let Some(hints) = failure.get("recoveryHints").and_then(|v| v.as_array()) {
        block.push_str("- Do **one** of:\n");
        for (i, h) in hints.iter().enumerate() {
            if let Some(s) = h.as_str() {
                block.push_str(&format!("  {}. {s}\n", i + 1));
            }
        }
    }
    block.push_str(&format!(
        "- Re-delegate attempts used: {delegate_attempts}\n\
         Suggested: read deliverable `.md`, re-delegate with narrower scope, or adjust `todo_write` — avoid restarting full discovery.\n"
    ));
    block
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ingest_map_paths() {
        let mut st = ArchitectRunState::new();
        st.ingest_workspace_map_output(&json!({
            "nodes": [
                {"path": "app-kdds-main/package.json"},
                {"path": "README.md"}
            ]
        }));
        assert!(st.workspace_map_loaded);
        assert!(st.workspace_paths.contains("app-kdds-main/package.json"));
    }

    #[test]
    fn path_matches_scope_leading_slash_scope_and_dir_grep() {
        assert!(path_matches_scope(
            "/app-kdds-main/README.md",
            "app-kdds-main"
        ));
        assert!(path_matches_scope(
            "app-kdds-main/STRUCTURE_ANALYSIS.md",
            "app-kdds-main"
        ));
    }

    #[test]
    fn path_matches_scope_windows_absolute() {
        assert!(path_matches_scope(
            "analyse-sous-agents.md",
            r"\\?\C:\Users\me\site-kdds\analyse-sous-agents.md"
        ));
        assert!(path_matches_scope(
            "app-kdds-main/package.json",
            r"C:\Users\me\site-kdds\app-kdds-main\package.json"
        ));
        assert!(!path_matches_scope(
            "app-kdds-main/src/",
            r"C:\Users\me\site-kdds\app-kdds-main\STRUCTURE_ANALYSIS.md"
        ));
    }

    #[test]
    fn complete_gate_allows_parallel_batch_secondary_task_when_verified() {
        let mut st = ArchitectRunState::new();
        st.delegate_counts.insert("t1".into(), 1);
        st.delegate_counts.insert("t2".into(), 1);
        st.verified_task_ids.insert("t2".into());
        assert!(st.complete_gate_for_task("t2").is_none());
    }

    #[test]
    fn complete_gate_allows_verified_without_delegate_count_fallback() {
        let mut st = ArchitectRunState::new();
        st.verified_task_ids.insert("t2".into());
        assert!(st.complete_gate_for_task("t2").is_none());
    }

    #[test]
    fn complete_gate_never_blocks_workflow() {
        let st = ArchitectRunState::new();
        assert!(st.complete_gate_for_task("t1").is_none());
        let mut delegated = ArchitectRunState::new();
        delegated.delegate_counts.insert("t1".into(), 1);
        assert!(delegated.complete_gate_for_task("t1").is_none());
    }

    #[test]
    fn path_matches_scope_absolute_grep_hit() {
        assert!(path_matches_scope(
            "app-kdds-main/src/components",
            r"\\?\C:\Users\me\site-kdds\app-kdds-main\src\components\animated-background.tsx"
        ));
    }

    #[test]
    fn try_mark_verified_from_grep_absolute_match_path() {
        let mut st = ArchitectRunState::new();
        st.last_delegate_task_id = Some("t4".into());
        st.last_delegate_status = Some(DelegateStatus::Partial);
        st.set_pending_delegate_scope(Some(vec!["app-kdds-main/src/components".into()]));
        let out = json!({
            "matches": [{
                "path": r"\\?\C:\Users\me\site-kdds\app-kdds-main\src\components\ui\button.tsx",
                "line_number": 1,
                "line": "import"
            }]
        });
        assert!(!st.try_mark_verified_from_grep_output(&out).is_empty());
        assert!(st.verified_task_ids.contains("t4"));
        assert!(!st.needs_compensation_block());
    }

    #[test]
    fn try_mark_verified_partial_t4_glob_scope() {
        let mut st = ArchitectRunState::new();
        st.delegate_counts.insert("t4".into(), 1);
        st.last_delegate_task_id = Some("t4".into());
        st.last_delegate_status = Some(DelegateStatus::Partial);
        st.set_pending_delegate_scope(Some(vec!["app-kdds-main/src/components/".into()]));
        assert!(!st.try_mark_verified(
            "grep",
            &json!({
                "glob": "app-kdds-main/src/components/**/*.tsx",
                "pattern": "^"
            }),
        )
        .is_empty());
        assert!(st.verified_task_ids.contains("t4"));
        assert!(st.complete_gate_for_task("t4").is_none());
    }

    /// Régression chat1 interaction 2 : délégation `partial` sur dossier + grep avec matches.
    #[test]
    fn partial_directory_delegate_grep_matches_verify_t2() {
        let mut st = ArchitectRunState::new();
        st.delegate_counts.insert("t2".into(), 1);
        st.set_task_delegate_scope(
            "t2",
            vec!["app-kdds-main/src".into()],
        );
        st.task_delegate_status
            .insert("t2".into(), DelegateStatus::Partial);
        st.last_delegate_task_id = Some("t2".into());
        st.last_delegate_status = Some(DelegateStatus::Partial);
        st.set_pending_delegate_scope(Some(vec!["app-kdds-main/src".into()]));
        let out = json!({
            "matches": [
                { "path": "app-kdds-main/src/foo.ts", "line_number": 1, "line": "x" },
                { "path": "app-kdds-main/src/bar.ts", "line_number": 2, "line": "y" }
            ]
        });
        assert!(!st.try_mark_verified_from_grep_output(&out).is_empty());
        assert!(st.verified_task_ids.contains("t2"));
        assert!(st.complete_gate_for_task("t2").is_none());
    }

    #[test]
    fn cycle_anchor_block_includes_user_request_and_plan() {
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Agrandir la lampe torche par 3×");
        st.anchor_run_objective("Modifier le rayon CSS de l'overlay flashlight");
        st.orchestration_plan_id = Some("plan_test".into());
        st.task_labels
            .insert("t1".into(), "Trouver flashlight-overlay.tsx".into());
        st.todo_statuses.insert("t1".into(), "in_progress".into());
        let block = st.cycle_anchor_block(None);
        assert!(block.contains(ARCHITECT_RUN_SNAPSHOT_MARKER));
        assert!(block.contains("Agrandir la lampe torche"));
        assert!(block.contains("**t1** [in_progress]"));
        assert!(block.contains("plan_test"));
    }

    #[test]
    fn cycle_anchor_block_includes_work_mode() {
        let mut st = ArchitectRunState::new();
        st.try_anchor_work_mode_from_text("[mode: discovery]\nExploring the repo.");
        let block = st.cycle_anchor_block(None);
        assert!(block.contains("discovery"));
        st.try_anchor_work_mode_from_text("[mode: task]");
        assert_eq!(st.work_mode_anchor, Some(ArchitectWorkMode::Discovery));
    }

    #[test]
    fn inject_architect_run_snapshot_after_checkpoint_replaces_previous() {
        use super::inject_architect_run_snapshot_after_checkpoint;
        let mut st = ArchitectRunState::new();
        st.anchor_user_request("Demande A");
        let mut msgs = vec![
            Message::system("main system"),
            Message::system("[context checkpoint — earlier messages compressed by the engine]\n\n## Objective\nold"),
            Message::user("tail"),
        ];
        inject_architect_run_snapshot_after_checkpoint(&mut msgs, &st.cycle_anchor_block(None));
        assert_eq!(
            msgs.iter()
                .filter(|m| is_architect_run_snapshot_message(m))
                .count(),
            1
        );
        assert!(msgs[2..]
            .iter()
            .any(|m| is_architect_run_snapshot_message(m)));
        st.anchor_user_request("Demande B");
        inject_architect_run_snapshot_after_checkpoint(&mut msgs, &st.cycle_anchor_block(None));
        assert_eq!(
            msgs.iter()
                .filter(|m| is_architect_run_snapshot_message(m))
                .count(),
            1
        );
        let anchor = msgs
            .iter()
            .find(|m| is_architect_run_snapshot_message(m))
            .unwrap();
        assert!(system_message_text(anchor).contains("Demande A"));
    }

    #[test]
    fn try_mark_verified_accepts_windows_absolute_read() {
        let mut st = ArchitectRunState::new();
        st.last_delegate_task_id = Some("t1".into());
        st.last_delegate_status = Some(DelegateStatus::Completed);
        st.set_pending_delegate_scope(Some(vec![
            "README.md".into(),
            "analyse-sous-agents.md".into(),
        ]));
        assert!(!st
            .try_mark_verified(
                "file_read",
                &json!({ "path": r"\\?\C:\ws\analyse-sous-agents.md" }),
            )
            .is_empty());
        assert!(st.verified_task_ids.contains("t1"));
    }

    /// Régression chat1 plan_1779992707 : délégation `partial` fichier unique + `file_read` scope.
    #[test]
    fn chat1_partial_t2_home_content_file_read_marks_verified() {
        let mut st = ArchitectRunState::new();
        st.delegate_counts.insert("t2".into(), 1);
        st.set_task_delegate_scope(
            "t2",
            vec!["app-kdds-main/src/components/home-content.tsx".into()],
        );
        st.task_delegate_status
            .insert("t2".into(), DelegateStatus::Partial);
        st.last_delegate_task_id = Some("t2".into());
        st.last_delegate_status = Some(DelegateStatus::Partial);
        st.set_pending_delegate_scope(Some(vec![
            "app-kdds-main/src/components/home-content.tsx".into(),
        ]));

        let newly = st.try_mark_verified(
            "file_read",
            &json!({
                "path": "app-kdds-main/src/components/home-content.tsx",
                "start_line": 155,
                "end_line": 210
            }),
        );
        assert!(!newly.is_empty(), "file_read on scope should verify t2");
        assert!(st.verified_task_ids.contains("t2"));
        assert!(st.complete_gate_for_task("t2").is_none());
    }
}
