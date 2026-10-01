//! Handlers RPC `embed.*` (CB2) — extraits du monolithe handlers.

use serde_json::{Value, json};

use super::super::protocol::{EmbedEncodeParams, EmbedLoadParams};
use super::super::{ENGINE_ERROR, RpcError};
use super::{decode_required, internal};

pub async fn embed_status(_params: Option<Value>) -> Result<Value, RpcError> {
    let status = tokio::task::spawn_blocking(drox_embed::status)
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))?;
    serde_json::to_value(status).map_err(internal)
}

pub async fn embed_load(params: Option<Value>) -> Result<Value, RpcError> {
    let params: EmbedLoadParams = decode_required(params, "embed.load requires `modelPath`")?;
    let path = params.model_path.clone();
    let status = tokio::task::spawn_blocking(move || drox_embed::load_model(std::path::Path::new(&path)))
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))?
        .map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))?;
    serde_json::to_value(status).map_err(internal)
}

pub async fn embed_encode(params: Option<Value>) -> Result<Value, RpcError> {
    let params: EmbedEncodeParams = decode_required(params, "embed.encode requires `texts`")?;
    let texts = params.texts;
    let vectors = tokio::task::spawn_blocking(move || drox_embed::encode(&texts))
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))?
        .map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))?;
    serde_json::to_value(json!({ "vectors": vectors })).map_err(internal)
}
