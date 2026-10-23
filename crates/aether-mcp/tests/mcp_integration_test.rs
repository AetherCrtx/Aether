use aether_mcp::McpToolHandler;
use aether_protocol::ipc::async_codec::{read_ipc_message, write_ipc_message};
use aether_protocol::ipc::{IpcEvent, IpcMessage, IpcRequestPayload, IpcResponsePayload};
use aether_protocol::mcp::McpContent;
use aetherd::brain_db::BrainDb;
use aetherd::pty_manager::PtyManager;
use aetherd::DaemonContext;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::UnixListener;
use tokio::sync::broadcast;

#[tokio::test]
async fn test_mcp_server_tools_flow() -> Result<(), Box<dyn std::error::Error>> {
    let temp_dir = std::env::temp_dir();
    let socket_path = temp_dir.join(format!("test_mcp_{}.sock", uuid::Uuid::new_v4().simple()));
    let _ = std::fs::remove_file(&socket_path);

    // 1. Setup in-memory BrainDb and mock daemon listener
    let db = BrainDb::open_in_memory()?;
    db.upsert_workspace("ws_test", "Test Workspace", "/tmp", None)?;
    db.register_agent_instance(
        "claude-code",
        "ws_test",
        "claude-code",
        Some(1234),
        None,
        None,
        aether_protocol::agent::AgentStatus::Idle,
    )?;

    let (event_tx, _) = broadcast::channel::<IpcEvent>(128);
    let pty_manager = Arc::new(PtyManager::new(event_tx.clone()));
    let ctx = DaemonContext {
        db: db.clone(),
        pty_manager,
        event_tx,
    };

    let listener = UnixListener::bind(&socket_path)?;
    let daemon_ctx = ctx.clone();

    let server_task = tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let inner_ctx = daemon_ctx.clone();
            tokio::spawn(async move {
                while let Ok(msg) = read_ipc_message(&mut stream).await {
                    if let IpcMessage::Request(req) = msg {
                        let req_id = req.id;
                        match req.payload {
                            IpcRequestPayload::PublishBlackboard(bb_req) => {
                                let entry = inner_ctx
                                    .db
                                    .publish_blackboard(
                                        &bb_req.workspace_id,
                                        &bb_req.author_agent_id,
                                        bb_req.entry_type,
                                        &bb_req.title,
                                        &bb_req.content_markdown,
                                        bb_req.target_agent_id.as_deref(),
                                    )
                                    .unwrap();

                                let resp = aether_protocol::ipc::IpcResponse::ok(
                                    req_id,
                                    IpcResponsePayload::BlackboardPublished { entry_id: entry.id },
                                );
                                let _ = write_ipc_message(&mut stream, &IpcMessage::Response(resp)).await;
                            }
                            IpcRequestPayload::GetSharedContext(ctx_req) => {
                                let summary = inner_ctx
                                    .db
                                    .get_shared_context(&ctx_req.workspace_id, ctx_req.query.as_deref())
                                    .unwrap();

                                let resp = aether_protocol::ipc::IpcResponse::ok(
                                    req_id,
                                    IpcResponsePayload::SharedContext(summary),
                                );
                                let _ = write_ipc_message(&mut stream, &IpcMessage::Response(resp)).await;
                            }
                            IpcRequestPayload::ClaimModule(claim_req) => {
                                let (granted, conflicts) = inner_ctx
                                    .db
                                    .claim_file_locks(
                                        &claim_req.workspace_id,
                                        &claim_req.agent_id,
                                        &claim_req.files,
                                        claim_req.intent.as_deref(),
                                    )
                                    .unwrap();

                                let resp = aether_protocol::ipc::IpcResponse::ok(
                                    req_id,
                                    IpcResponsePayload::ModuleClaimed { granted, conflicts },
                                );
                                let _ = write_ipc_message(&mut stream, &IpcMessage::Response(resp)).await;
                            }
                            _ => {}
                        }
                    }
                }
            });
        }
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    // 2. Instantiate McpToolHandler
    let socket_str = socket_path.to_string_lossy().to_string();
    let handler = McpToolHandler::new(socket_str, "ws_test", "claude-code");

    // 3. Test aether_claim_module via MCP
    let claim_result = handler
        .handle_tool_call(
            "aether_claim_module",
            Some(json!({
                "files": ["src/auth.rs"],
                "intent": "Refactoring password hashing",
            })),
        )
        .await;
    assert!(!claim_result.is_error);

    // 4. Test aether_publish_blackboard via MCP
    let pub_result = handler
        .handle_tool_call(
            "aether_publish_blackboard",
            Some(json!({
                "type": "API_CONTRACT",
                "title": "Auth Endpoints",
                "content": "POST /auth/login\nPOST /auth/refresh",
            })),
        )
        .await;
    assert!(!pub_result.is_error);

    // 5. Test aether_get_shared_context via MCP
    let ctx_result = handler
        .handle_tool_call("aether_get_shared_context", None)
        .await;
    assert!(!ctx_result.is_error);

    if let McpContent::Text { text } = &ctx_result.content[0] {
        assert!(text.contains("Active Advisory File Locks"));
        assert!(text.contains("src/auth.rs"));
        assert!(text.contains("Auth Endpoints"));
        assert!(text.contains("POST /auth/login"));
    } else {
        panic!("Expected McpContent::Text in context result");
    }

    server_task.abort();
    let _ = std::fs::remove_file(&socket_path);
    Ok(())
}
