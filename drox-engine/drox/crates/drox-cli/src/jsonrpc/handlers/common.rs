//! Utilitaires partagés des handlers JSON-RPC.

use std::collections::BTreeMap;

use camino::Utf8PathBuf;
use drox_engine::default_sessions_dir;
use drox_llm::{LlmConfig, OllamaClient};
use serde_json::{Value, json};
use std::sync::Arc;

use crate::jsonrpc::{CONFIG_ERROR, INVALID_PARAMS, INTERNAL_ERROR, RpcError};

pub(crate) fn build_llm_config(
    server: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
    headers: &BTreeMap<String, String>,
    num_ctx_override: Option<i64>,
) -> Result<LlmConfig, RpcError> {
    let server_url = server.unwrap_or_else(|| {
        std::env::var("DROX_SERVER").unwrap_or_else(|_| "http://localhost:11434".into())
    });
    let model = model.unwrap_or_else(|| {
        std::env::var("DROX_MODEL").unwrap_or_else(|_| "llama3.2".into())
    });

    let mut llm_config = LlmConfig::try_from_str(&server_url, &model)
        .map_err(|e| RpcError::new(CONFIG_ERROR, format!("invalid LLM config: {e}")))?;
    if let Some(k) = api_key.or_else(|| std::env::var("DROX_API_KEY").ok()) {
        llm_config = llm_config.with_api_key(k);
    }
    for (name, value) in headers {
        llm_config = llm_config.with_header(name, value);
    }
    if let Some(n) = env_i64("DROX_NUM_PREDICT") {
        llm_config = llm_config.with_num_predict(n);
    }
    if let Some(n) = num_ctx_override.or_else(|| env_i64("DROX_NUM_CTX")) {
        llm_config = llm_config.with_num_ctx(n);
    }
    if let Some(v) = env_f32("DROX_TOP_P") {
        llm_config = llm_config.with_top_p(Some(v));
    }
    if let Some(n) = env_i64("DROX_TOP_K") {
        llm_config = llm_config.with_top_k(Some(n));
    }
    if let Some(v) = env_f32("DROX_REPEAT_PENALTY") {
        llm_config = llm_config.with_repeat_penalty(Some(v));
    }
    if let Some(n) = env_i64("DROX_SEED") {
        llm_config = llm_config.with_seed(Some(n));
    }
    if let Some(v) = env_f32("DROX_MIN_P") {
        llm_config = llm_config.with_min_p(Some(v));
    }
    if let Some(v) = env_f32("DROX_PRESENCE_PENALTY") {
        llm_config = llm_config.with_presence_penalty(Some(v));
    }
    if let Some(v) = env_f32("DROX_FREQUENCY_PENALTY") {
        llm_config = llm_config.with_frequency_penalty(Some(v));
    }
    if let Ok(s) = std::env::var("DROX_KEEP_ALIVE") {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            llm_config = llm_config.with_keep_alive(Some(trimmed.to_owned()));
        }
    }
    Ok(llm_config)
}

pub(crate) fn build_ollama_from_llm_connect_fields(
    server: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
    headers: &BTreeMap<String, String>,
    num_ctx_override: Option<i64>,
) -> Result<Arc<OllamaClient>, RpcError> {
    let llm_config = build_llm_config(server, model, api_key, headers, num_ctx_override)?;
    Ok(Arc::new(
        OllamaClient::new(llm_config)
            .map_err(|e| RpcError::new(CONFIG_ERROR, format!("LLM init failed: {e}")))?,
    ))
}

pub(crate) fn env_i64(key: &str) -> Option<i64> {
    std::env::var(key).ok().and_then(|s| s.parse().ok())
}

pub(crate) fn env_f32(key: &str) -> Option<f32> {
    std::env::var(key).ok().and_then(|s| s.parse().ok())
}

pub(crate) fn resolve_session_dir(arg: Option<Utf8PathBuf>) -> Result<Utf8PathBuf, RpcError> {
    if let Some(p) = arg {
        return Ok(p);
    }
    default_sessions_dir().map_err(|e| RpcError::new(CONFIG_ERROR, format!("session dir: {e}")))
}

pub(crate) fn resolve_workspace(arg: Option<Utf8PathBuf>) -> Result<Utf8PathBuf, RpcError> {
    let raw = match arg {
        Some(p) => p,
        None => Utf8PathBuf::try_from(
            std::env::current_dir()
                .map_err(|e| RpcError::new(CONFIG_ERROR, format!("cwd: {e}")))?,
        )
        .map_err(|e| RpcError::new(CONFIG_ERROR, format!("cwd not UTF-8: {e}")))?,
    };
    let canonical = std::fs::canonicalize(raw.as_std_path())
        .map_err(|e| RpcError::new(CONFIG_ERROR, format!("workspace `{raw}`: {e}")))?;
    Utf8PathBuf::try_from(canonical)
        .map_err(|e| RpcError::new(CONFIG_ERROR, format!("workspace not UTF-8: {e}")))
}

pub(crate) fn decode_optional<T: serde::de::DeserializeOwned + Default>(
    params: Option<Value>,
) -> Result<T, RpcError> {
    match params {
        None | Some(Value::Null) => Ok(T::default()),
        Some(v) => serde_json::from_value(v)
            .map_err(|e| RpcError::new(INVALID_PARAMS, format!("invalid params: {e}"))),
    }
}

pub(crate) fn decode_required<T: serde::de::DeserializeOwned>(
    params: Option<Value>,
    missing_msg: &str,
) -> Result<T, RpcError> {
    let Some(v) = params else {
        return Err(RpcError::new(INVALID_PARAMS, missing_msg.to_string()));
    };
    serde_json::from_value(v).map_err(|e| {
        RpcError::new(INVALID_PARAMS, format!("invalid params: {e}"))
            .with_data(json!({ "hint": missing_msg }))
    })
}

pub(crate) fn internal<E: std::fmt::Display>(e: E) -> RpcError {
    RpcError::new(INTERNAL_ERROR, e.to_string())
}

/// Résout le profil moteur produit pour `agent.run`.
///
/// `engineStrictness` / `engineTuning` restent au wire pour rétrocompat mais sont ignorés.
pub(crate) fn resolve_agent_run_engine_tuning(
    params: &crate::jsonrpc::protocol::AgentRunParams,
) -> drox_engine::EngineTuning {
    warn_if_deprecated_engine_tuning_params(params);
    drox_engine::resolve_engine_tuning(
        params.engine_strictness.as_deref(),
        params.engine_tuning.as_ref(),
    )
}

fn warn_if_deprecated_engine_tuning_params(
    params: &crate::jsonrpc::protocol::AgentRunParams,
) {
    let mut deprecated = false;
    if let Some(s) = params.engine_strictness.as_deref() {
        let n = s.trim().to_ascii_lowercase();
        if !matches!(n.as_str(), "normal" | "default" | "standard") {
            deprecated = true;
        }
    }
    if params.engine_tuning.is_some() {
        deprecated = true;
    }
    if deprecated {
        tracing::warn!(
            "agent.run: engineStrictness/engineTuning are deprecated and ignored (single product profile)"
        );
    }
}

#[cfg(test)]
mod engine_tuning_tests {
    use super::resolve_agent_run_engine_tuning;
    use crate::jsonrpc::protocol::AgentRunParams;
    use drox_engine::EngineTuning;
    use serde_json::json;

    #[test]
    fn absent_params_yield_product_default() {
        let p: AgentRunParams = serde_json::from_value(json!({ "prompt": "hi" })).unwrap();
        assert_eq!(
            resolve_agent_run_engine_tuning(&p),
            EngineTuning::product_default()
        );
    }

    #[test]
    fn wire_strictness_and_tuning_resolve_to_product_default() {
        let expected = EngineTuning::product_default();
        for strictness in ["relaxed", "normal", "strict", "custom"] {
            let p: AgentRunParams = serde_json::from_value(json!({
                "prompt": "hi",
                "engineStrictness": strictness
            }))
            .unwrap();
            assert_eq!(
                resolve_agent_run_engine_tuning(&p),
                expected,
                "strictness={strictness}"
            );
        }
        let p: AgentRunParams = serde_json::from_value(json!({
            "prompt": "hi",
            "engineStrictness": "strict",
            "engineTuning": { "readBudgetPercent": 12 }
        }))
        .unwrap();
        assert_eq!(resolve_agent_run_engine_tuning(&p), expected);
    }
}
