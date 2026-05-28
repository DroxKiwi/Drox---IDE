//! Rapport structuré renvoyé au parent par le tool `task` (M5).

use serde_json::{Value, json};

/// Résultat brut d'un sous-agent Explore.
#[derive(Debug, Clone)]
pub struct SubagentExploreResult {
    pub report_markdown: String,
    pub truncated: bool,
    pub iterations_used: usize,
}

const MAX_REPORT_MARKDOWN_CHARS: usize = 8_000;

/// Sortie immédiate d'un `task` async (`background: true`).
#[must_use]
pub fn structure_task_async_pending(job_id: &str, description: &str) -> Value {
    json!({
        "mode": "async",
        "status": "running",
        "job_id": job_id,
        "description": description.trim(),
        "hint": "Explore sub-agent running in the background. The parent may continue; \
                  the structured report will be injected when the job completes."
    })
}

/// Construit la sortie JSON `task` pour l'historique parent (synthèse, pas traces outils).
#[must_use]
pub fn structure_task_output(result: &SubagentExploreResult) -> Value {
    structure_task_output_with_mode(result, "sync")
}

/// Rapport injecté après complétion d'un job async.
#[must_use]
pub fn structure_task_async_completed(job_id: &str, result: &SubagentExploreResult) -> Value {
    let mut v = structure_task_output_with_mode(result, "async_completed");
    if let Value::Object(ref mut map) = v {
        map.insert("job_id".to_string(), json!(job_id));
    }
    v
}

fn structure_task_output_with_mode(result: &SubagentExploreResult, mode: &str) -> Value {
    let raw_len = result.report_markdown.chars().count();
    let report_markdown = truncate_chars(&result.report_markdown, MAX_REPORT_MARKDOWN_CHARS);
    let truncated = result.truncated || raw_len > MAX_REPORT_MARKDOWN_CHARS;
    let (summary, findings, open_questions) = parse_report_sections(&report_markdown);
    json!({
        "mode": mode,
        "subagent_type": "explore",
        "summary": summary,
        "findings": findings,
        "open_questions": open_questions,
        "report_markdown": report_markdown,
        "truncated": truncated,
        "iterations_used": result.iterations_used,
    })
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push_str("\n\n…");
    out
}

fn parse_report_sections(report: &str) -> (String, Vec<String>, Vec<String>) {
    let mut findings = Vec::new();
    let mut open_questions = Vec::new();
    for line in report.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let stripped = t
            .trim_start_matches(|c: char| c == '-' || c == '*' || c.is_numeric() || c == '.' || c == ' ')
            .trim();
        if stripped.is_empty() {
            continue;
        }
        if stripped.contains('?') && stripped.len() < 200 {
            open_questions.push(stripped.to_string());
        } else if stripped.starts_with("Finding:")
            || stripped.starts_with("finding:")
            || t.starts_with("- ")
            || t.starts_with("* ")
        {
            findings.push(stripped.to_string());
        }
    }
    let summary = report
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('['))
        .unwrap_or("(no summary)")
        .chars()
        .take(500)
        .collect::<String>();
    if findings.len() > 12 {
        findings.truncate(12);
    }
    if open_questions.len() > 8 {
        open_questions.truncate(8);
    }
    (summary, findings, open_questions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structure_output_has_required_fields() {
        let result = SubagentExploreResult {
            report_markdown: "Audit complete.\n- Found auth module.\nOpen auth.rs?".to_string(),
            truncated: false,
            iterations_used: 3,
        };
        let v = structure_task_output(&result);
        assert_eq!(v["subagent_type"], "explore");
        assert!(v["summary"].is_string());
        assert!(v["findings"].is_array());
        assert_eq!(v["iterations_used"].as_u64(), Some(3));
    }

    #[test]
    fn truncates_long_report_markdown() {
        let long = "x".repeat(10_000);
        let result = SubagentExploreResult {
            report_markdown: long,
            truncated: false,
            iterations_used: 1,
        };
        let v = structure_task_output(&result);
        assert_eq!(v["truncated"], true);
        assert!(v["report_markdown"]
            .as_str()
            .unwrap_or("")
            .chars()
            .count()
            <= MAX_REPORT_MARKDOWN_CHARS + 8);
    }
}
