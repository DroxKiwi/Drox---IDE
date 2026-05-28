//! File d'attente des sous-agents Explore en arriere-plan (M5c).

use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::sync::Arc;

use drox_tools::{SubagentCompletedJob, SubagentExploreResult, SubagentHookEvent, SubagentSettings};
use parking_lot::Mutex;
use uuid::Uuid;

#[derive(Debug, Default)]
struct JobState {
    /// Jobs async encore en cours (`job_id` -> description courte).
    running: HashMap<String, String>,
    completed: VecDeque<SubagentCompletedJob>,
}

/// Entree job explore en cours (UI / re-perspective).
#[derive(Debug, Clone)]
pub struct RunningSubagentJob {
    pub job_id: String,
    pub description: String,
}

/// Registre partage par run (`Arc`) — spawn async + drain cote boucle parent.
#[derive(Debug, Clone, Default)]
pub struct SubagentJobRegistry {
    inner: Arc<Mutex<JobState>>,
}

impl SubagentJobRegistry {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn running_count(&self) -> usize {
        self.inner.lock().running.len()
    }

    #[must_use]
    pub fn running_job_entries(&self) -> Vec<RunningSubagentJob> {
        self.inner
            .lock()
            .running
            .iter()
            .map(|(job_id, description)| RunningSubagentJob {
                job_id: job_id.clone(),
                description: description.clone(),
            })
            .collect()
    }

    /// Retire tous les jobs termines depuis le dernier drain.
    pub fn drain_completed(&self) -> Vec<SubagentCompletedJob> {
        let mut st = self.inner.lock();
        st.completed.drain(..).collect()
    }

    fn push_completed(&self, job_id: &str, job: SubagentCompletedJob) {
        let mut st = self.inner.lock();
        st.running.remove(job_id);
        st.completed.push_back(job);
    }

    #[must_use]
    pub fn new_job_id() -> String {
        format!("sub_{}", Uuid::new_v4())
    }

    /// Lance une future en arriere-plan ; retourne l'id tout de suite.
    pub fn spawn<Fut>(
        &self,
        job_id: String,
        description: String,
        settings: SubagentSettings,
        fut: Fut,
    ) where
        Fut: Future<Output = Result<SubagentExploreResult, String>> + Send + 'static,
    {
        let desc_for_hook = description.trim().to_string();
        emit_hook(
            &settings,
            SubagentHookEvent::Start {
                subagent_type: "explore".to_string(),
                description: desc_for_hook.clone(),
                job_id: Some(job_id.clone()),
                background: true,
            },
        );
        self.inner
            .lock()
            .running
            .insert(job_id.clone(), desc_for_hook.clone());
        let registry = self.clone();
        let job_id_spawn = job_id.clone();
        tokio::spawn(async move {
            let result = fut.await;
            match &result {
                Ok(ok) => {
                    let summary = ok
                        .report_markdown
                        .lines()
                        .map(str::trim)
                        .find(|l| !l.is_empty() && !l.starts_with('['))
                        .unwrap_or(&ok.report_markdown)
                        .chars()
                        .take(300)
                        .collect::<String>();
                    emit_hook(
                        &settings,
                        SubagentHookEvent::Done {
                            subagent_type: "explore".to_string(),
                            summary,
                            truncated: ok.truncated,
                            iterations_used: ok.iterations_used,
                            job_id: Some(job_id_spawn.clone()),
                            success: true,
                            error_message: None,
                        },
                    );
                }
                Err(err) => {
                    let summary = err.chars().take(300).collect::<String>();
                    emit_hook(
                        &settings,
                        SubagentHookEvent::Done {
                            subagent_type: "explore".to_string(),
                            summary,
                            truncated: false,
                            iterations_used: 0,
                            job_id: Some(job_id_spawn.clone()),
                            success: false,
                            error_message: Some(err.clone()),
                        },
                    );
                }
            }
            let completed = SubagentCompletedJob {
                job_id: job_id_spawn.clone(),
                description: desc_for_hook,
                result,
            };
            registry.push_completed(&job_id_spawn, completed);
        });
    }
}

fn emit_hook(settings: &SubagentSettings, event: SubagentHookEvent) {
    if let Some(ref hook) = settings.event_hook {
        hook(event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_tools::SubagentExploreResult;

    #[tokio::test]
    async fn spawn_tracks_running_then_drains_completed() {
        let reg = SubagentJobRegistry::new();
        let settings = SubagentSettings::default();
        reg.spawn(
            "job_a".to_string(),
            "audit src".to_string(),
            settings,
            async {
                Ok(SubagentExploreResult {
                    report_markdown: "ok".to_string(),
                    truncated: false,
                    iterations_used: 1,
                })
            },
        );
        assert_eq!(reg.running_count(), 1);
        assert!(reg.drain_completed().is_empty());
        tokio::task::yield_now().await;
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert_eq!(reg.running_count(), 0);
        let done = reg.drain_completed();
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].job_id, "job_a");
        assert!(done[0].result.is_ok());
    }
}
