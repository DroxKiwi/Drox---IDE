//! Handlers des méthodes du protocole drox JSON-RPC v1.
//!
//! Les handlers ne touchent pas directement à `stdout` : ils renvoient un
//! `Value` ou un [`RpcError`], le [`super::server::Server`] s'occupe de
//! sérialiser la `Response` et de pousser les notifications.

mod agent;
mod decode;
mod embed;
mod initialize;
mod session;
mod setup;

pub use agent::{RunOutcome, agent_cancel, agent_run};
pub use embed::{embed_encode, embed_load, embed_status};
pub use initialize::initialize;
pub use session::{session_compact, session_list, session_read, session_truncate_after_last_user};

#[cfg(test)]
mod tests {
use std::collections::BTreeMap;

    use drox_engine::{PermissionMode, default_tool_registry};
    use drox_tools::{ToolError, UserAsker, UserQuestion};
    use drox_types::Content;
    use serde_json::json;

    use super::super::server::Server;
    use super::super::INVALID_PARAMS;
    use super::setup::{
        RefuseAsker, apply_disabled_tools, build_llm_config, build_user_blocks,
        omit_disabled_tool_docs, permission_mode_from_rpc, wrap_executable_tools,
    };
    use super::*;
    use crate::jsonrpc::rpc_types::{AgentRunImage, AgentRunParams};

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
        apply_disabled_tools(&mut reg, &["bash".into(), "todo_write".into()]);
        assert!(reg.get("bash").is_none());
        assert!(reg.get("file_read").is_some());
        assert!(reg.get("todo_write").is_some());
    }

    #[test]
    fn omit_disabled_memory_section() {
        let prompt = "# Phase protocol\n\n- `analyzing`: read-only: `file_read`, `lsp`, `memory_*`.\n\n# Tools\n\n- **`file_read { path }`**: read.\n\n# Session memory\n\n- **`memory_read { slug }`**: reload.\n\n# Security\n\nStay safe.\n";
        let out = omit_disabled_tool_docs(
            prompt,
            &[
                "memory_read".into(),
                "memory_list".into(),
                "session_note".into(),
                "session_search".into(),
            ],
        );
        assert!(out.contains("mémoire de session sont désactivés"));
        assert!(!out.contains("memory_read"));
        assert!(!out.contains("memory_*"));
        assert!(out.contains("file_read"));
        assert!(out.contains("# Security"));
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

    #[tokio::test]
    async fn agent_cancel_rejects_missing_params() {
        let (tx, _rx) = tokio::sync::mpsc::channel::<String>(1);
        let server = Server::new(tx);
        let err = agent_cancel(&server, None).await.unwrap_err();
        assert_eq!(err.code, INVALID_PARAMS);
    }

    #[tokio::test]
    async fn agent_cancel_emits_agent_done_cancelled() {
        let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(8);
        let server = Server::new(tx);
        let join = tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            RunOutcome::Completed
        });
        server.register_run("run_cancel_test".into(), join);
        let ok = agent_cancel(&server, Some(json!({ "runId": "run_cancel_test" })))
            .await
            .expect("cancel ok");
        assert_eq!(ok["cancelled"], true);
        let wire = rx.recv().await.expect("notification");
        let v: serde_json::Value = serde_json::from_str(&wire).expect("json");
        assert_eq!(v["method"], "agent/done");
        assert_eq!(v["params"]["runId"], "run_cancel_test");
        assert_eq!(v["params"]["status"], "cancelled");
    }

    #[tokio::test]
    async fn refuse_asker_returns_interactive_error() {
        let asker = RefuseAsker;
        let res = asker
            .ask(UserQuestion {
                id: None,
                prompt: "yes?".into(),
                choices: Vec::new(),
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

    #[test]
    fn permission_mode_from_rpc_maps_ide_vignettes() {
        assert_eq!(permission_mode_from_rpc("analyze"), PermissionMode::Plan);
        assert_eq!(
            permission_mode_from_rpc("trustEdit"),
            PermissionMode::AcceptEdits
        );
        assert_eq!(
            permission_mode_from_rpc("imNotCrazy"),
            PermissionMode::Default
        );
        assert_eq!(
            permission_mode_from_rpc("acceptEdits"),
            PermissionMode::AcceptEdits
        );
    }

    #[test]
    fn build_user_blocks_puts_text_before_images() {
        let params = AgentRunParams {
            prompt: "décris".into(),
            images: vec![
                AgentRunImage {
                    mime: "image/png".into(),
                    data: "AAAA".into(),
                },
                AgentRunImage {
                    mime: "image/jpeg".into(),
                    data: "BBBB".into(),
                },
            ],
            ..Default::default()
        };
        let blocks = build_user_blocks(&params);
        assert_eq!(blocks.len(), 3);
        assert!(matches!(&blocks[0], Content::Text { .. }));
        assert!(matches!(&blocks[1], Content::Image { .. }));
        assert!(matches!(&blocks[2], Content::Image { .. }));
    }

    #[test]
    fn build_llm_config_prefers_num_ctx_from_agent_run_params() {
        let params = AgentRunParams {
            prompt: "x".into(),
            num_ctx: Some(65_536),
            ..Default::default()
        };
        let cfg = build_llm_config(
            Some("http://localhost:11434".into()),
            Some("m".into()),
            None,
            &BTreeMap::new(),
            Some(&params),
        )
        .unwrap();
        assert_eq!(cfg.num_ctx, 65_536);
    }
}
