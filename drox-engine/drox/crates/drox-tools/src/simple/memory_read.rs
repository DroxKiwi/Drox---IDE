//! Tool `memory_read` — recharge le contenu complet d'une session archivée.
//!
//! Sprint M1. Le listing court (slug + objectif 1 ligne) est injecté en
//! début de system prompt à chaque run. Quand le modèle juge utile de
//! recharger les détails d'une session passée, il appelle ce tool avec
//! le slug correspondant.
//!
//! Read-only filesystem, scope strict `.drox/memory/sessions/`. Aucune
//! traversée hors workspace.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};

use drox_session::memory_sessions;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

/// Borne dure sur la taille du fichier lu — protège le contexte du modèle
/// au cas où un utilisateur aurait collé un dump géant dans le .md.
const MAX_BYTES_RETURNED: usize = 64 * 1024;

/// Payload reçu par le tool `memory_read`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct MemoryReadInput {
    /// Slug de la session à recharger, tel qu'affiché dans le listing
    /// (champ `slug` du front-matter — **pas** le préfixe date-heure du fichier).
    pub slug: String,
}

/// Tool local `memory_read`.
pub struct MemoryReadTool;

#[async_trait]
impl Tool for MemoryReadTool {
    fn name(&self) -> &str {
        "memory_read"
    }

    fn description(&self) -> &str {
        "Reloads the full content (front-matter + markdown body) of an \
         archived workspace session, from its short slug (front-matter \
         `slug` field — **without** the date-time prefix of the \
         filename). Read-only. Returns the text as-is — \
         extract what is relevant for the current task yourself. \
         Format: {\"slug\": \"…\"}."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(MemoryReadInput)).unwrap_or(Value::Null)
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: MemoryReadInput = serde_json::from_value(input).map_err(|e| {
            ToolError::invalid_args(format!(
                "memory_read: payload invalid JSON ({e}). Expected format: {{\"slug\": \"…\"}}.",
            ))
        })?;
        let slug = args.slug.trim();
        if slug.is_empty() {
            return Err(ToolError::invalid_args("memory_read: `slug` is empty"));
        }
        // On retrouve l'entrée correspondante via le listing — ça nous donne
        // la date (donc le chemin canonique) sans avoir à reparser le nom
        // de fichier nous-mêmes, et ça nous garantit qu'on ne sortira pas
        // du dossier `sessions/`.
        let listing = memory_sessions::load_sessions_listing(&ctx.workspace_root, 0)
            .await
            .map_err(|e| {
                ToolError::invalid_args(format!(
                    "memory_read: cannot list sessions in workspace ({e})",
                ))
            })?;
        let Some(entry) = listing.into_iter().find(|e| e.slug == slug) else {
            return Err(ToolError::invalid_args(format!(
                "memory_read: no session found with slug `{slug}`",
            )));
        };
        let raw = memory_sessions::read_session(&entry.path).await.map_err(|e| match e {
            drox_session::SessionError::Io(src) => ToolError::io(entry.path.clone(), src),
            other => ToolError::invalid_args(format!("memory_read: {other}")),
        })?;
        let (returned, truncated) = if raw.len() > MAX_BYTES_RETURNED {
            (raw[..MAX_BYTES_RETURNED].to_string(), true)
        } else {
            (raw, false)
        };
        Ok(json!({
            "slug": entry.slug,
            "path": entry.path.as_str(),
            "date": entry.date.to_rfc3339(),
            "truncated": truncated,
            "content": returned,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use chrono::Utc;
    use drox_session::memory_sessions::{
        SessionFrontMatter, compute_session_path, write_session,
    };
    use tempfile::tempdir;

    async fn seed_session(ws: &camino::Utf8Path, slug: &str, body: &str) {
        let date = Utc::now();
        let path = compute_session_path(ws, date, slug);
        let front = SessionFrontMatter {
            slug: slug.into(),
            objective: format!("Test {slug}"),
            date,
            model: "test".into(),
            files_touched: vec![],
        };
        write_session(&path, &front, body).await.unwrap();
    }

    #[tokio::test]
    async fn reads_existing_session_by_slug() {
        let dir = tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        seed_session(&ws, "alpha", "## Notes\n- pt1\n").await;

        let ctx = ToolContext::new(ws, false);
        let out = MemoryReadTool
            .execute(&ctx, json!({ "slug": "alpha" }))
            .await
            .unwrap();
        assert_eq!(out["slug"], "alpha");
        assert_eq!(out["truncated"], false);
        let content = out["content"].as_str().unwrap();
        assert!(content.contains("slug: alpha"));
        assert!(content.contains("## Notes"));
    }

    #[tokio::test]
    async fn errors_when_slug_unknown() {
        let dir = tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let ctx = ToolContext::new(ws, false);
        let err = MemoryReadTool
            .execute(&ctx, json!({ "slug": "ghost" }))
            .await
            .unwrap_err();
        assert!(
            matches!(err, ToolError::InvalidArgs(ref m) if m.contains("no session found")),
            "got {err:?}"
        );
    }

    #[tokio::test]
    async fn rejects_empty_slug() {
        let dir = tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let ctx = ToolContext::new(ws, false);
        let err = MemoryReadTool
            .execute(&ctx, json!({ "slug": "   " }))
            .await
            .unwrap_err();
        assert!(matches!(err, ToolError::InvalidArgs(_)), "got {err:?}");
    }
}
