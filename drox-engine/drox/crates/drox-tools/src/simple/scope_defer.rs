//! Tool `scope_defer` — note un finding hors scope sans l'exécuter (§2.25).

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

const MAX_FINDING_LEN: usize = 400;
const MAX_REASON_LEN: usize = 240;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScopeDeferInput {
    /// Ce qui a été découvert (fichier orphelin, README obsolète, etc.).
    pub finding: String,
    /// Pourquoi ce n'est pas dans l'objectif du run courant.
    pub reason: String,
}

pub struct ScopeDeferTool;

#[async_trait]
impl Tool for ScopeDeferTool {
    fn name(&self) -> &str {
        "scope_defer"
    }

    fn description(&self) -> &str {
        "Defer a finding **out of scope** of the user request (inconsistency, debt, \
         parallel lead) without acting on it. Use when exploration surfaces something \
         interesting but **not requested** — then continue toward the locked objective. \
         Format: {\"finding\": \"…\", \"reason\": \"…\"}."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(ScopeDeferInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: ScopeDeferInput = serde_json::from_value(input).map_err(|e| {
            ToolError::invalid_args(format!(
                "scope_defer: invalid JSON ({e}). Expected: {{\"finding\": \"…\", \"reason\": \"…\"}}."
            ))
        })?;
        let finding = args.finding.trim().to_string();
        let reason = args.reason.trim().to_string();
        if finding.is_empty() || reason.is_empty() {
            return Err(ToolError::invalid_args(
                "scope_defer: `finding` and `reason` are required (non-empty).",
            ));
        }
        if finding.len() > MAX_FINDING_LEN {
            return Err(ToolError::invalid_args(format!(
                "scope_defer: `finding` is too long (max {MAX_FINDING_LEN} chars)."
            )));
        }
        if reason.len() > MAX_REASON_LEN {
            return Err(ToolError::invalid_args(format!(
                "scope_defer: `reason` is too long (max {MAX_REASON_LEN} chars)."
            )));
        }
        let Some(handle) = ctx.scope_deferred.as_ref() else {
            return Err(ToolError::invalid_args(
                "scope_defer: tool unavailable in this context (no scope parking wired)",
            ));
        };
        let total = handle.push(finding.clone(), reason.clone());
        Ok(json!({
            "ok": true,
            "total_deferred": total,
            "finding": finding,
            "reason": reason,
        }))
    }
}

#[cfg(test)]
mod tests {
    use camino::Utf8PathBuf;
    use serde_json::json;

    use super::*;
    use crate::scope_deferred::ScopeDeferredHandle;

    #[tokio::test]
    async fn scope_defer_pushes_to_handle() {
        let handle = ScopeDeferredHandle::new();
        let ctx = ToolContext::new(Utf8PathBuf::from("."), false)
            .with_scope_deferred(handle.clone());
        let tool = ScopeDeferTool;
        let out = tool
            .execute(
                &ctx,
                json!({
                    "finding": "README obsolète",
                    "reason": "hors demande Prisma"
                }),
            )
            .await
            .expect("scope_defer ok");
        assert_eq!(out["total_deferred"], 1);
        assert_eq!(handle.len(), 1);
        assert_eq!(handle.snapshot()[0].finding, "README obsolète");
    }
}
