//! Handlers des méthodes du protocole drox JSON-RPC v1.
//!
//! Les handlers ne touchent pas directement à stdout : ils renvoient un
//! Value ou un [RpcError], le [super::server::Server] s'occupe de
//! sérialiser la Response et de pousser les notifications.

mod agent_run;
mod orchestration_run;
mod common;
mod initialize;
mod session;
mod workspace;

pub use agent_run::{agent_cancel, agent_run, RunOutcome};
pub use initialize::initialize;
pub use session::{session_compact, session_list, session_read};
pub use workspace::workspace_reset;

#[cfg(test)]
mod tests {
    use super::agent_cancel;
    use super::agent_run::wrap_executable_tools;
    use crate::system_prompt::registry::apply_disabled_tools;
    use super::initialize::initialize;
    use super::session::{session_compact, session_read};
    use drox_engine::default_tool_registry;
    use drox_tools::{ToolError, UserQuestion};
    use serde_json::json;

    use crate::jsonrpc::handlers::agent_run::RefuseAsker;
    use crate::jsonrpc::server::Server;
    use crate::jsonrpc::INVALID_PARAMS;
    use drox_tools::UserAsker;

    fn fresh_server() -> Server {
        let (tx, _rx) = tokio::sync::mpsc::channel::<String>(8);
        Server::new(tx)
    }

    #[tokio::test]
    async fn initialize_handler_ignores_missing_params() {
        let server = fresh_server();
        let v = initialize(&server, None).await.unwrap();
        assert_eq!(v["serverName"], json!("drox"));
        assert_eq!(v["protocolVersion"], json!("1.0"));
    }

    #[tokio::test]
    async fn initialize_handler_accepts_explicit_params() {
        let server = fresh_server();
        let params = json!({
            "protocolVersion": "1.0",
            "clientName": "vscode-drox",
            "clientVersion": "0.1.0"
        });
        let v = initialize(&server, Some(params)).await.unwrap();
        assert_eq!(v["capabilities"]["sessions"], json!(true));
    }

    #[test]
    fn apply_disabled_tools_removes_bash_keeps_file_read() {
        let mut reg = default_tool_registry();
        apply_disabled_tools(&mut reg, &["bash".into(), "ask_user_question".into()]);
        assert!(reg.get("bash").is_none());
        assert!(reg.get("file_read").is_some());
        assert!(reg.get("ask_user_question").is_some());
    }

    #[tokio::test]
    async fn initialize_records_executable_tools_from_client() {
        let server = fresh_server();
        let params = json!({
            "clientCapabilities": {
                "executableTools": ["file_write", "bash"]
            }
        });
        initialize(&server, Some(params)).await.unwrap();
        assert!(server.is_executable_remotely("file_write"));
        assert!(server.is_executable_remotely("bash"));
        assert!(!server.is_executable_remotely("file_read"));
    }

    #[tokio::test]
    async fn build_tool_registry_wraps_declared_tools() {
        let server = fresh_server();
        server.set_executable_tools(["file_write".to_string()]);
        let registry = wrap_executable_tools(default_tool_registry(), &server, "run_test");
        // Le tool est toujours présent — mais c'est maintenant le wrapper, pas l'impl locale.
        assert!(registry.get("file_write").is_some());
        // Les autres restent inchangés et fonctionnels.
        assert!(registry.get("file_read").is_some());
    }

    #[tokio::test]
    async fn session_read_rejects_bad_id() {
        let err = session_read(Some(json!({ "id": "not_a_session" })))
            .await
            .unwrap_err();
        assert_eq!(err.code, INVALID_PARAMS);
    }

    #[tokio::test]
    async fn session_compact_rejects_bad_id() {
        let err = session_compact(Some(json!({ "id": "not_a_session" })))
            .await
            .unwrap_err();
        assert_eq!(err.code, INVALID_PARAMS);
    }

    #[tokio::test]
    async fn session_compact_rejects_empty_transcript() {
        let err = session_compact(Some(json!({ "id": "ses_aaaaaaaaaaaaaaaa" })))
            .await
            .unwrap_err();
        assert_eq!(err.code, INVALID_PARAMS);
    }

    #[test]
    fn agent_cancel_rejects_missing_params() {
        let (tx, _rx) = tokio::sync::mpsc::channel::<String>(1);
        let server = Server::new(tx);
        let err = agent_cancel(&server, None).unwrap_err();
        assert_eq!(err.code, INVALID_PARAMS);
    }

    #[tokio::test]
    async fn refuse_asker_returns_interactive_error() {
        let asker = RefuseAsker;
        let res = asker
            .ask(UserQuestion {
                id: None,
                prompt: "yes?".into(),
                choices: Vec::new(),
                structured_options: vec![],
                allow_multiple: false,
                allow_free_text: false,
            })
            .await;
        match res {
            Err(ToolError::Interactive(msg)) => {
                assert!(
                    msg.contains("interactive prompts are disabled")
                        || msg.contains("interactiveAsk"),
                    "got: {msg}",
                );
            }
            other => panic!("expected Interactive error, got {other:?}"),
        }
    }
}
