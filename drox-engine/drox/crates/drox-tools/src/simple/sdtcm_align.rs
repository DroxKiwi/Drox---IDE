//! Tool `sdtcm_align` — réaligner la carte SDTCM.
//!
//! Le diff appartient à SDTCM (copie des fichiers cités), pas à git.
//! L'impl locale refuse ; avec `executableTools` côté client, un [`RemoteTool`]
//! exécute `tool/exec`.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

use crate::error::ToolError;
use crate::tool::Tool;
use crate::tool_context::ToolContext;

/// Arguments de `sdtcm_align`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct SdtcmAlignInput {
    /// Note optionnelle transmise au rôle qui réaligne la carte.
    #[serde(default)]
    pub note: Option<String>,
}

/// Tool `sdtcm_align` (stub local).
pub struct SdtcmAlignTool;

#[async_trait]
impl Tool for SdtcmAlignTool {
    fn name(&self) -> &str {
        "sdtcm_align"
    }

    fn description(&self) -> &str {
        drox_prompts::SDTCM_ALIGN_TOOL_DESCRIPTION
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(SdtcmAlignInput)).unwrap_or(Value::Null)
    }

    fn is_read_only(&self) -> bool {
        false
    }

    fn is_concurrency_safe(&self) -> bool {
        false
    }

    async fn execute(&self, _ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let value = if input.is_null() {
            Value::Object(Default::default())
        } else {
            input
        };
        let SdtcmAlignInput { note: _note } = serde_json::from_value(value).map_err(|e| {
            ToolError::invalid_args(format!(
                "sdtcm_align: invalid JSON ({e}). Expected: {{ \"note\"?: \"…\" }}."
            ))
        })?;
        Err(ToolError::invalid_args(
            "sdtcm_align: only available when the IDE client executes this tool \
             via tool/exec (Drox VS Code extension).",
        ))
    }
}
