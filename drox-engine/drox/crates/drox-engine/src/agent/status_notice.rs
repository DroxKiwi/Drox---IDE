//! Émission de notices transcript typées (sémantique Cline `status-notice`).

use tokio::sync::mpsc;

use crate::error::EngineError;
use crate::event::{AgentEvent, StatusNoticeLevel};

pub(crate) async fn emit_status_notice(
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    kind: &str,
    level: StatusNoticeLevel,
    message: impl Into<String>,
) -> Result<(), ()> {
    tx.send(Ok(AgentEvent::StatusNotice {
        notice_kind: kind.into(),
        level,
        message: message.into(),
        detail: None,
    }))
    .await
    .map_err(|_| ())
}