//! Persist segment reports under `.drox/rail-segments/` (C8).

use camino::{Utf8Path, Utf8PathBuf};

use super::report::SegmentReport;

/// Write `report` as JSON under `.drox/rail-segments/<run_id>/<task_id>.json`.
pub async fn persist_segment_report(
    workspace: &Utf8Path,
    run_id: &str,
    report: &SegmentReport,
) -> std::io::Result<Utf8PathBuf> {
    let dir = workspace.join(".drox/rail-segments").join(run_id);
    tokio::fs::create_dir_all(dir.as_std_path()).await?;
    let path = dir.join(format!("{}.json", report.task_id));
    let body = serde_json::to_string_pretty(report).unwrap_or_default();
    tokio::fs::write(path.as_std_path(), body).await?;
    Ok(path)
}
