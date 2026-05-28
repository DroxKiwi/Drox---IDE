//! Handler `initialize`.

use serde_json::Value;

use crate::jsonrpc::handlers::common::{decode_optional, internal};
use crate::jsonrpc::protocol::{InitializeParams, InitializeResult};
use crate::jsonrpc::server::Server;
use crate::jsonrpc::RpcError;

#[allow(clippy::unused_async)]
pub async fn initialize(server: &Server, params: Option<Value>) -> Result<Value, RpcError> {
    let parsed: InitializeParams = decode_optional(params)?;
    if let Some(caps) = parsed.client_capabilities {
        if !caps.executable_tools.is_empty() {
            tracing::info!(
                tools = ?caps.executable_tools,
                "client declared executable tools (delegated via tool/exec)"
            );
        }
        server.set_executable_tools(caps.executable_tools);
        if caps.interactive_ask {
            tracing::info!("client declared `interactiveAsk` — RpcUserAsker will be installed");
        }
        server.set_interactive_ask(caps.interactive_ask);
    }
    let r = InitializeResult::current();
    serde_json::to_value(r).map_err(internal)
}
