//! Drox local text embeddings (CB2).
//!
//! - Default build: [`status`] reports `built: false` (IDE stays lexical-only).
//! - `--features embed`: links llama.cpp and encodes GGUF embedding models.

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

struct LoadedState {
    path: String,
    dimensions: u32,
    #[cfg(feature = "embed")]
    engine: llama_rt::Engine,
}

static LOADED: Mutex<Option<LoadedState>> = Mutex::new(None);

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
    #[cfg(not(feature = "embed"))]
    {
        let _ = model_path;
        return Err(EmbedError::NotBuilt);
    }
    #[cfg(feature = "embed")]
    {
        if !model_path.is_file() {
            return Err(EmbedError::ModelPath(model_path.display().to_string()));
        }
        let engine =
            llama_rt::Engine::load(model_path).map_err(EmbedError::Runtime)?;
        let dimensions = engine.dimensions();
        let path = model_path.display().to_string();
        {
            let mut guard = LOADED.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
            *guard = Some(LoadedState {
                path,
                dimensions,
                engine,
            });
        }
        // Must not call status() while holding LOADED — would deadlock.
        Ok(status())
    }
}

/// Encode texts with the currently loaded model (call [`load_model`] first).
pub fn encode(texts: &[String]) -> Result<Vec<EmbedVector>, EmbedError> {
    #[cfg(not(feature = "embed"))]
    {
        let _ = texts;
        return Err(EmbedError::NotBuilt);
    }
    #[cfg(feature = "embed")]
    {
        let mut guard = LOADED.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(loaded) = guard.as_mut() else {
            return Err(EmbedError::Runtime("no model loaded".into()));
        };
        let rows = loaded
            .engine
            .encode(texts)
            .map_err(EmbedError::Runtime)?;
        Ok(rows
            .into_iter()
            .map(|values| EmbedVector { values })
            .collect())
    }
}

/// Unload the in-process model (frees RAM).
pub fn unload() {
    let mut guard = LOADED.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    *guard = None;
}

#[cfg(feature = "embed")]
mod llama_rt {
    use std::num::NonZeroU32;
    use std::path::Path;

    use llama_cpp_2::context::params::{LlamaContextParams, LlamaPoolingType};
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::{AddBos, LlamaModel};

    pub struct Engine {
        backend: LlamaBackend,
        model: LlamaModel,
        dimensions: u32,
    }

    // Process-wide Mutex in parent serializes access; llama.cpp types are Send in practice.
    #[allow(unsafe_code)]
    unsafe impl Send for Engine {}

    impl Engine {
        pub fn load(path: &Path) -> Result<Self, String> {
            let backend = LlamaBackend::init().map_err(|e| e.to_string())?;
            // Avoid mmap + extra buffer repack hangs seen on Windows with some MiniLM GGUFs.
            let model_params = LlamaModelParams::default()
                .with_n_gpu_layers(0)
                .with_use_mmap(false);
            let model = LlamaModel::load_from_file(&backend, path, &model_params)
                .map_err(|e| e.to_string())?;
            // Prefer output embedding size when the GGUF is an embedding model.
            let n = model.n_embd_out();
            let dimensions = u32::try_from(if n > 0 { n } else { model.n_embd() })
                .map_err(|e| e.to_string())?;
            Ok(Self {
                backend,
                model,
                dimensions,
            })
        }

        pub fn dimensions(&self) -> u32 {
            self.dimensions
        }

        pub fn encode(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
            let mut out = Vec::with_capacity(texts.len());
            for text in texts {
                out.push(self.encode_one(text)?);
            }
            Ok(out)
        }

        fn encode_one(&mut self, text: &str) -> Result<Vec<f32>, String> {
            // Single-thread decode avoids OpenMP ↔ tokio deadlocks on Windows.
            let n_ctx = NonZeroU32::new(512).ok_or_else(|| "n_ctx".to_string())?;
            let ctx_params = LlamaContextParams::default()
                .with_n_ctx(Some(n_ctx))
                .with_n_threads(1)
                .with_n_threads_batch(1)
                .with_embeddings(true)
                .with_pooling_type(LlamaPoolingType::Mean);

            let mut ctx = self
                .model
                .new_context(&self.backend, ctx_params)
                .map_err(|e| e.to_string())?;

            let tokens = self
                .model
                .str_to_token(text, AddBos::Always)
                .map_err(|e| e.to_string())?;
            if tokens.is_empty() {
                return Ok(vec![0.0; self.dimensions as usize]);
            }

            // Cap tokens to context window.
            let max_tokens = (n_ctx.get() as usize).saturating_sub(1).max(1);
            let tokens = if tokens.len() > max_tokens {
                tokens[..max_tokens].to_vec()
            } else {
                tokens
            };

            let mut batch = LlamaBatch::new(tokens.len().max(1), 1);
            batch
                .add_sequence(&tokens, 0, true)
                .map_err(|e| e.to_string())?;

            ctx.clear_kv_cache();
            ctx.decode(&mut batch).map_err(|e| e.to_string())?;

            let embedding = ctx
                .embeddings_seq_ith(0)
                .map_err(|e| e.to_string())?;
            Ok(normalize(embedding))
        }
    }

    fn normalize(input: &[f32]) -> Vec<f32> {
        let magnitude = input
            .iter()
            .fold(0.0_f32, |acc, &val| val.mul_add(val, acc))
            .sqrt();
        if magnitude == 0.0 {
            return input.to_vec();
        }
        input.iter().map(|&val| val / magnitude).collect()
    }
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
