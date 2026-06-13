impl ArchitectRunState {
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
            run_objective: live_run_objective
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| self.run_objective_anchor.clone()),
            todo_items,
            workspace_map_loaded: self.workspace_map_loaded,
        }
    }

    /// Plan / todos pour le snapshot (≤ `anchor_plan_max_items` lignes).
    #[must_use]
    pub(crate) fn format_plan_snapshot_public(&self) -> String {
        self.format_plan_snapshot()
    }

    /// Résumé une ligne pour station ANSWER (context diet).
    #[must_use]
    pub(crate) fn format_todos_summary_one_line(&self) -> String {
        if self.task_labels.is_empty() && self.todo_statuses.is_empty() {
            return "*(no todos)*".to_string();
        }
        let mut ids: Vec<String> = self
            .task_labels
            .keys()
            .chain(self.todo_statuses.keys())
            .cloned()
            .collect();
        ids.sort();
        ids.dedup();
        let parts: Vec<String> = ids
            .iter()
            .take(self.anchor_plan_max_items)
            .map(|id| {
                let status = self
                    .todo_statuses
                    .get(id)
                    .map(String::as_str)
                    .unwrap_or("pending");
                format!("{id}:{status}")
            })
            .collect();
        parts.join(", ")
    }

    /// Tâche courante : première `in_progress` hors meta.
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
        None
    }

    #[must_use]
    fn format_plan_snapshot(&self) -> String {
        if self.task_labels.is_empty() && self.todo_statuses.is_empty() {
            return "*(no plan yet — optional `todo_write` for multi-step work)*".to_string();
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
            let _ = std::fmt::Write::write_fmt(
                &mut out,
                format_args!("\n- **{id}** [{status}] — {label}"),
            );
        }
        out.trim_start_matches('\n').to_string()
    }

    /// Tâche de synthèse / résumé.
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
