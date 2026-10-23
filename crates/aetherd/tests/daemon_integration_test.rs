use aether_protocol::agent::CliType;
use aether_protocol::ipc::async_codec::{read_ipc_message, write_ipc_message};
use aether_protocol::ipc::{
    IpcEvent, IpcMessage, IpcRequest, IpcRequestPayload, IpcResponsePayload, SpawnPaneRequest,
};
use aetherd::brain_db::BrainDb;
use aetherd::pty_manager::PtyManager;
use aetherd::DaemonContext;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::broadcast;

#[tokio::test]
async fn test_daemon_unix_socket_integration() -> Result<(), Box<dyn std::error::Error>> {
    let temp_dir = std::env::temp_dir();
    let socket_path = temp_dir.join(format!("test_aether_{}.sock", uuid::Uuid::new_v4().simple()));
    let _ = std::fs::remove_file(&socket_path);

    // 1. Initialize DB, PTY manager, and Context
    let db = BrainDb::open_in_memory()?;
    let (event_tx, _) = broadcast::channel::<IpcEvent>(1024);
    let pty_manager = Arc::new(PtyManager::new(event_tx.clone()));
    let obsidian_sync = Arc::new(aetherd::obsidian_sync::ObsidianSyncEngine::new(
        db.clone(),
        "default",
        temp_dir.join("test_vault"),
    ));

    let ctx = DaemonContext {
        db,
        pty_manager,
        event_tx,
        obsidian_sync,
    };

    let listener = UnixListener::bind(&socket_path)?;
    let server_ctx = ctx.clone();

    // 2. Spawn server acceptor
    let server_handle = tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let client_ctx = server_ctx.clone();
            tokio::spawn(async move {
                handle_test_client(stream, client_ctx).await;
            });
        }
    });

    // 3. Connect client over Unix Stream
    tokio::time::sleep(Duration::from_millis(50)).await;
    let mut client_stream = UnixStream::connect(&socket_path).await?;

    // 4. Send Ping Request
    let ping_msg = IpcMessage::Request(IpcRequest::new("req_ping_1", IpcRequestPayload::Ping));
    write_ipc_message(&mut client_stream, &ping_msg).await?;

    // 5. Read Pong Response
    let response = read_ipc_message(&mut client_stream).await?;
    match response {
        IpcMessage::Response(res) => {
            assert_eq!(res.reply_to, "req_ping_1");
            assert_eq!(res.payload.unwrap(), IpcResponsePayload::Pong);
        }
        other => panic!("Expected IpcResponse, got: {:?}", other),
    }

    // 6. Test SpawnPane
    let spawn_msg = IpcMessage::Request(IpcRequest::new(
        "req_spawn_1",
        IpcRequestPayload::SpawnPane(SpawnPaneRequest {
            pane_id: Some("agent_claude_test".to_string()),
            workspace_id: "test_ws".to_string(),
            cli_type: CliType::ClaudeCode,
            command: Some("/bin/echo".to_string()),
            args: vec!["AETHER_READY_SIGNAL".to_string()],
            working_dir: PathBuf::from("/tmp"),
            cols: 80,
            rows: 24,
            isolated_worktree: false,
            env_vars: HashMap::new(),
        }),
    ));
    write_ipc_message(&mut client_stream, &spawn_msg).await?;

    // Wait for Spawned response or Output events
    let mut received_output = false;
    let mut received_spawned = false;
    let timeout = tokio::time::sleep(Duration::from_secs(2));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            msg_res = read_ipc_message(&mut client_stream) => {
                match msg_res? {
                    IpcMessage::Response(res) if res.reply_to == "req_spawn_1" => {
                        received_spawned = true;
                    }
                    IpcMessage::Event(IpcEvent::PtyOutput { data, .. }) => {
                        let text = String::from_utf8_lossy(&data);
                        if text.contains("AETHER_READY_SIGNAL") {
                            received_output = true;
                        }
                    }
                    IpcMessage::Event(IpcEvent::PaneExited { .. }) => {
                        if received_output && received_spawned {
                            break;
                        }
                    }
                    _ => {}
                }
            }
            _ = &mut timeout => {
                break;
            }
        }

        if received_output && received_spawned {
            break;
        }
    }

    assert!(received_spawned, "Did not receive PaneSpawned response");
    assert!(received_output, "Did not receive PTY output event");

    // Cleanup
    server_handle.abort();
    let _ = std::fs::remove_file(&socket_path);

    Ok(())
}

async fn handle_test_client(stream: UnixStream, ctx: DaemonContext) {
    let (mut reader, mut writer) = stream.into_split();
    let (outgoing_tx, mut outgoing_rx) = tokio::sync::mpsc::channel::<IpcMessage>(64);

    let writer_task = tokio::spawn(async move {
        while let Some(msg) = outgoing_rx.recv().await {
            if write_ipc_message(&mut writer, &msg).await.is_err() {
                break;
            }
        }
    });

    let mut event_rx = ctx.event_tx.subscribe();
    let event_tx_clone = outgoing_tx.clone();
    let subscriber_task = tokio::spawn(async move {
        loop {
            if let Ok(event) = event_rx.recv().await {
                if event_tx_clone.send(IpcMessage::Event(event)).await.is_err() {
                    break;
                }
            }
        }
    });

    loop {
        match read_ipc_message(&mut reader).await {
            Ok(IpcMessage::Request(req)) => {
                let req_id = req.id;
                match req.payload {
                    IpcRequestPayload::Ping => {
                        let _ = outgoing_tx
                            .send(IpcMessage::Response(aether_protocol::ipc::IpcResponse::ok(
                                req_id,
                                IpcResponsePayload::Pong,
                            )))
                            .await;
                    }
                    IpcRequestPayload::SpawnPane(spawn_req) => {
                        let pane_id = spawn_req
                            .pane_id
                            .unwrap_or_else(|| "pane_test".to_string());
                        let pid = ctx
                            .pty_manager
                            .spawn_pane(
                                pane_id.clone(),
                                spawn_req.command,
                                spawn_req.args,
                                spawn_req.working_dir,
                                spawn_req.cols,
                                spawn_req.rows,
                                spawn_req.env_vars,
                            )
                            .await
                            .unwrap();

                        let _ = outgoing_tx
                            .send(IpcMessage::Response(aether_protocol::ipc::IpcResponse::ok(
                                req_id,
                                IpcResponsePayload::PaneSpawned(
                                    aether_protocol::ipc::PaneSpawnedInfo {
                                        pane_id,
                                        pid: Some(pid),
                                        worktree_path: None,
                                        git_branch: None,
                                    },
                                ),
                            )))
                            .await;
                    }
                    _ => {}
                }
            }
            _ => break,
        }
    }

    writer_task.abort();
    subscriber_task.abort();
}
