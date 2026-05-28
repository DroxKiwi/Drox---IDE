//! Statut et extraction du rapport exécuteur pour `delegate_executor`.

use super::executor_deliverable::{DeliverableOnDisk, synthesize_executor_report_from_disk};

/// Statut wire renvoyé à l'architecte et à l'UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DelegateStatus {
    Completed,
    Partial,
    Blocked,
    Failed,
}

impl DelegateStatus {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Partial => "partial",
            Self::Blocked => "blocked",
            Self::Failed => "failed",
        }
    }

    #[must_use]
    pub fn success(self) -> bool {
        !matches!(self, Self::Failed)
    }
}

/// Extrait le bloc « Executor report » du stream assistant (ignore le monologue amont).
#[must_use]
pub fn extract_executor_report(full_text: &str) -> Option<String> {
    let lower = full_text.to_ascii_lowercase();
    let marker = "## executor report";
    let start = lower.find(marker)?;
    let slice = &full_text[start..];
    let end = slice
        .find("\n[phase: done]")
        .or_else(|| slice.find("\n[phase: answering]"))
        .unwrap_or(slice.len());
    Some(slice[..end].trim().to_string())
}

/// Parse `**Status:** completed | partial | blocked` from an Executor report.
#[must_use]
pub fn executor_report_status(report: &str) -> Option<&'static str> {
    let lower = report.to_ascii_lowercase();
    let marker = "**status:**";
    let idx = lower.find(marker)?;
    let tail = lower[idx + marker.len()..].trim_start();
    let word = tail.split_whitespace().next()?;
    match word {
        "completed" => Some("completed"),
        "partial" => Some("partial"),
        "blocked" => Some("blocked"),
        "failed" => Some("failed"),
        _ => None,
    }
}

#[must_use]
pub fn deliverable_met_in_report(report: &str) -> bool {
    let lower = report.to_ascii_lowercase();
    let Some(idx) = lower.find("deliverable check") else {
        return false;
    };
    let tail = &lower[idx..lower.len().min(idx + 96)];
    if tail.contains("not met") {
        return false;
    }
    tail.contains("met")
}

/// Résout statut + rapport architecte à partir du stream exécuteur.
#[must_use]
pub fn finalize_delegate_result(
    task_id: &str,
    full_stream: &str,
    hit_max: bool,
    engine_errored: bool,
    successful_tools: usize,
    engine_error: Option<&str>,
    deliverable_on_disk: Option<&DeliverableOnDisk>,
) -> (DelegateStatus, String) {
    let tools_succeeded = successful_tools > 0;
    let extracted = extract_executor_report(full_stream);
    let body = extracted.as_deref().unwrap_or(full_stream.trim());
    let report_status = executor_report_status(body);
    let blocked = report_status == Some("blocked");
    let deliverable_ok =
        !blocked && !body.is_empty() && deliverable_met_in_report(body);
    let disk_ok = !blocked
        && deliverable_on_disk.is_some_and(|d| !d.content.trim().is_empty());

    let status = if blocked {
        DelegateStatus::Blocked
    } else if engine_errored && !tools_succeeded && !disk_ok {
        DelegateStatus::Failed
    } else if deliverable_ok || disk_ok {
        DelegateStatus::Completed
    } else if tools_succeeded || hit_max || !full_stream.trim().is_empty() {
        DelegateStatus::Partial
    } else {
        DelegateStatus::Failed
    };

    let mut report = if let Some(extracted) = extracted.filter(|s| !s.is_empty()) {
        extracted
    } else if let Some(disk) = deliverable_on_disk {
        synthesize_executor_report_from_disk(task_id, disk)
    } else if tools_succeeded {
        "(Executor ran tools but did not produce a structured **Executor report** — \
         Architect must verify the workspace or re-delegate with a clearer brief.)"
            .to_string()
    } else if matches!(status, DelegateStatus::Failed) {
        format!("*(Executor engine error on task `{task_id}`.)*")
    } else {
        "(Executor finished without a structured report — verify or re-delegate.)".to_string()
    };

    if hit_max {
        report.push_str("\n\n---\n*(Executor iteration limit reached.)*");
    }
    if engine_errored && tools_succeeded && !matches!(status, DelegateStatus::Completed) {
        report.push_str(
            "\n\n---\n*(Engine error after tool work — status is `partial`; \
             fix the brief or re-delegate once.)*",
        );
        if let Some(err) = engine_error {
            report.push_str("\nEngine: `");
            report.push_str(err);
            report.push('`');
        }
    } else if engine_errored && matches!(status, DelegateStatus::Failed) {
        report.push_str("\n\n---\n*(Executor engine error — no successful tool work.)*");
        if let Some(err) = engine_error {
            report.push_str("\nEngine: `");
            report.push_str(err);
            report.push('`');
        }
    }

    (status, report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_report_skips_monologue() {
        let raw = "Let me read files...\n\n## Executor report · t1\n\n**Deliverable check:** met\n";
        let ex = extract_executor_report(raw).unwrap();
        assert!(ex.starts_with("## Executor report"));
        assert!(!ex.contains("Let me read"));
    }

    #[test]
    fn deliverable_met_detected() {
        let r = "## Executor report · t1\n\n**Deliverable check:** met — ok\n";
        assert!(deliverable_met_in_report(r));
    }

    #[test]
    fn glob_noise_is_partial_not_completed() {
        let raw = "I will glob node_modules...\n## Executor report · t2\n\n**Deliverable check:** not met\n";
        let (status, _) = finalize_delegate_result("t2", raw, false, false, 3, None, None);
        assert_eq!(status, DelegateStatus::Partial);
    }

    #[test]
    fn structured_met_is_completed() {
        let raw = "## Executor report · t1\n\n**Deliverable check:** met\n\n**What I did:**\n- read file\n";
        let (status, report) = finalize_delegate_result("t1", raw, false, false, 1, None, None);
        assert_eq!(status, DelegateStatus::Completed);
        assert!(report.contains("Executor report"));
    }

    #[test]
    fn engine_error_after_met_report_stays_completed() {
        let raw = "## Executor report · t1\n\n**Deliverable check:** met\n";
        let (status, _) = finalize_delegate_result(
            "t1",
            raw,
            false,
            true,
            2,
            Some("loop detected"),
            None,
        );
        assert_eq!(status, DelegateStatus::Completed);
    }

    #[test]
    fn engine_error_without_tools_is_failed() {
        let (status, _) = finalize_delegate_result("t1", "", false, true, 0, Some("timeout"), None);
        assert_eq!(status, DelegateStatus::Failed);
    }

    #[test]
    fn disk_deliverable_completes_without_stream_report() {
        let disk = DeliverableOnDisk {
            path: ".drox/agent-output/t2/report.md".into(),
            bytes: 300,
            content: "# Report\n\nDone.".into(),
        };
        let (status, report) = finalize_delegate_result(
            "t2",
            "Let me read files again and again…",
            true,
            false,
            2,
            None,
            Some(&disk),
        );
        assert_eq!(status, DelegateStatus::Completed);
        assert!(report.contains("on-disk deliverable"));
    }

    #[test]
    fn blocked_status_not_completed_even_with_disk() {
        let raw = "## Executor report · t1\n\n**Status:** blocked\n\n**Deliverable check:** not met\nScope has 200 files.\n";
        let disk = DeliverableOnDisk {
            path: ".drox/agent-output/t1/report.md".into(),
            bytes: 300,
            content: "# Blocked\n".into(),
        };
        let (status, _) = finalize_delegate_result(
            "t1",
            raw,
            false,
            false,
            2,
            None,
            Some(&disk),
        );
        assert_eq!(status, DelegateStatus::Blocked);
    }

    #[test]
    fn executor_report_status_parsed() {
        let r = "## Executor report · t1\n\n**Status:** blocked\n";
        assert_eq!(executor_report_status(r), Some("blocked"));
    }
}
