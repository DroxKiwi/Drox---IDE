//! Tool `codebase_search` — retrieval hybride sur l’index `@Codebase` local.
//!
//! L’index (chunks + vecteurs MiniLM) vit dans l’extension VS Code sous
//! `.drox/codebase-index/`. L’impl **locale** refuse ; avec `executableTools`
//! côté client, un [`RemoteTool`] exécute `tool/exec`.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

/// Arguments de `codebase_search`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct CodebaseSearchInput {
    /// Requête en langage naturel ou mots-clés (chemins, symboles, intention).
    pub query: String,
    /// Nombre max de hits (défaut côté client si absent).
    #[serde(default)]
    pub limit: Option<u32>,
    /// Préfixe de chemin optionnel pour restreindre la recherche (posix relatif).
    #[serde(default)]
    pub path_prefix: Option<String>,
}

/// Tool `codebase_search` (stub local).
pub struct CodebaseSearchTool;

#[async_trait]
impl Tool for CodebaseSearchTool {
    fn name(&self) -> &str {
        "codebase_search"
    }

    fn description(&self) -> &str {
        "Searches the workspace **local codebase index** (lexical + MiniLM hybrid). \
         Returns relevant code chunks with path/line ranges for grounding. \
         Prefer this over blind grepping when looking for behavior or concepts. \
         **Execution**: IDE client (Drox); unavailable outside delegated client. \
         Format: `{ \"query\": \"…\", \"limit\"?: N, \"path_prefix\"?: \"src/…\" }`."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(CodebaseSearchInput)).unwrap_or(Value::Null)
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn is_concurrency_safe(&self) -> bool {
        true
    }

    async fn execute(&self, _ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let CodebaseSearchInput {
            query,
            limit: _limit,
            path_prefix: _path_prefix,
        } = serde_json::from_value(input).map_err(|e| {
            ToolError::invalid_args(format!(
                "codebase_search: invalid JSON ({e}). Expected: {{ \"query\": \"…\", \"limit\"?: N, \"path_prefix\"?: \"…\" }}."
            ))
        })?;
        if query.trim().is_empty() {
            return Err(ToolError::invalid_args(
                "codebase_search: `query` cannot be empty.",
            ));
        }
        Err(ToolError::invalid_args(
            "codebase_search: only available when the IDE client executes this tool \
             via tool/exec (Drox VS Code extension).",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use serde_json::json;

    #[tokio::test]
    async fn rejects_empty_query() {
        let t = CodebaseSearchTool;
        let r = t
            .execute(
                &ToolContext::new(Utf8PathBuf::from("/tmp"), false),
                json!({ "query": "  " }),
            )
            .await;
        assert!(r.is_err());
    }
}
