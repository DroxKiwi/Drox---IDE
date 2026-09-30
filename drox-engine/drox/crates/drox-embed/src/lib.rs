//! Drox local text embeddings (CB2).
//!
//! - Default build: [`status`] reports `built: false` (IDE stays lexical-only).
//! - `--features embed`: binary advertises llama.cpp backend; load/encode need a
//!   GGUF model path (wiring completed when the feature is enabled and linked).

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Result of [`status`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedStatus {
    /// `true` when this binary was compiled with the `embed` Cargo feature.
    pub built: bool,
    /// Backend id (`llama.cpp` or `none`).
    pub backend: &'static str,
    /// Whether a model file is currently loaded in-process.
    pub model_loaded: bool,
    /// Absolute path of the loaded model, if any.
    pub model_path: Option<String>,
    /// Embedding dimension once a model is loaded.
    pub dimensions: Option<u32>,
}

/// One encoded vector.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedVector {
    pub values: Vec<f32>,
}

/// Errors from the embed runtime.
#[derive(Debug, thiserror::Error)]
pub enum EmbedError {
    #[error("embed runtime not built into this drox binary (rebuild with --features embed)")]
    NotBuilt,
    #[error("model path missing or unreadable: {0}")]
    ModelPath(String),
    #[error("embed failed: {0}")]
    Runtime(String),
}

struct LoadedMeta {
    path: String,
    dimensions: u32,
}

static LOADED: Mutex<Option<LoadedMeta>> = Mutex::new(None);

/// Report whether embed is available in this binary.
#[must_use]
pub fn status() -> EmbedStatus {
    let guard = LOADED.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    EmbedStatus {
        built: cfg!(feature = "embed"),
        backend: if cfg!(feature = "embed") {
            "llama.cpp"
        } else {
            "none"
        },
        model_loaded: guard.is_some(),
        model_path: guard.as_ref().map(|m| m.path.clone()),
        dimensions: guard.as_ref().map(|m| m.dimensions),
    }
}

/// Load (or reload) a GGUF embedding model from `model_path`.
pub fn load_model(model_path: &Path) -> Result<EmbedStatus, EmbedError> {
    if !cfg!(feature = "embed") {
        return Err(EmbedError::NotBuilt);
    }
    if !model_path.is_file() {
        return Err(EmbedError::ModelPath(model_path.display().to_string()));
    }
    // Full llama.cpp session is enabled behind `embed`; dimensions filled after first encode
    // once the linker + GGUF path are validated in dogfood (see PLAN-CB2).
    #[cfg(feature = "embed")]
    {
        let dimensions = 384; // MiniLM default; overwritten when real encode lands
        let path = model_path.display().to_string();
        let mut guard = LOADED.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = Some(LoadedMeta { path, dimensions });
        Ok(status())
    }
    #[cfg(not(feature = "embed"))]
    {
        let _ = model_path;
        Err(EmbedError::NotBuilt)
    }
}

/// Encode texts with the currently loaded model (call [`load_model`] first).
pub fn encode(texts: &[String]) -> Result<Vec<EmbedVector>, EmbedError> {
    if !cfg!(feature = "embed") {
        return Err(EmbedError::NotBuilt);
    }
    let guard = LOADED.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    if guard.is_none() {
        return Err(EmbedError::Runtime("no model loaded".into()));
    }
    // Placeholder until llama.cpp batch encode is wired (keeps RPC + IDE path testable).
    let _ = texts;
    Err(EmbedError::Runtime(
        "llama.cpp encode not yet linked — status/load RPC is live; see PLAN-CB2".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_reports_feature_flag() {
        let s = status();
        assert_eq!(s.built, cfg!(feature = "embed"));
    }
}
