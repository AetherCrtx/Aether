use aether_protocol::agent::{BlackboardEntryType, CliType};
use aether_protocol::ipc::async_codec::{read_ipc_message, write_ipc_message};
use aether_protocol::ipc::{
    ClaimModuleRequest, CreateSnapshotRequest, IpcEvent, IpcMessage, IpcRequest, IpcRequestPayload,
    IpcResponsePayload, MergeWorktreeRequest, ObsidianReadNoteRequest,
    ObsidianUpdateTaskRequest, PaneSpawnedInfo, PaneSummary, PtyInputRequest, PublishBlackboardRequest,
    ReleaseModuleRequest, ResizePaneRequest, RollbackSnapshotRequest, SharedContextSummary,
    SpawnPaneRequest, WorktreeDiffRequest, WorktreeDiffSummary,
};
use aether_protocol::{AETHER_SOCK_ENV, DEFAULT_SOCKET_NAME};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use tokio::net::UnixStream;
use tracing::{info, warn};
use uuid::Uuid;

pub struct GuiBridgeState {
    socket_path: PathBuf,
    input_tx: tokio::sync::mpsc::Sender<PtyInputRequest>,
}

impl GuiBridgeState {
    pub fn new() -> Self {
        let socket_path = resolve_socket_path();
        let (input_tx, mut input_rx) = tokio::sync::mpsc::channel::<PtyInputRequest>(2048);
        let worker_socket = socket_path.clone();

        // Spawn a dedicated persistent connection worker for lightning-fast PTY input
        tauri::async_runtime::spawn(async move {
            let mut writer_opt: Option<tokio::net::unix::OwnedWriteHalf> = None;

            while let Some(req) = input_rx.recv().await {
                // Drain any additional requests queued in input_rx to batch them
                let mut batches: Vec<PtyInputRequest> = vec![req];
                while let Ok(next_req) = input_rx.try_recv() {
                    if let Some(last) = batches.last_mut() {
                        if last.pane_id == next_req.pane_id {
                            last.data.extend(next_req.data);
                            continue;
                        }
                    }
                    batches.push(next_req);
                }

                // Connect or reconnect if stream is not established
                if writer_opt.is_none() {
                    match UnixStream::connect(&worker_socket).await {
                        Ok(s) => {
                            let (mut reader, writer) = s.into_split();
                            // Spawn background response drainer so read doesn't block write
                            tauri::async_runtime::spawn(async move {
                                while let Ok(msg) = read_ipc_message(&mut reader).await {
                                    if let IpcMessage::Response(res) = msg {
                                        if let Err(err) = res.payload {
                                            warn!("PTY input error from daemon: [{}] {}", err.code, err.message);
                                        }
                                    }
                                }
                            });
                            writer_opt = Some(writer);
                        }
                        Err(_) => {
                            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                            continue;
                        }
                    }
                }

                if let Some(writer) = writer_opt.as_mut() {
                    for batch in batches {
                        let req_id = format!("in_{}", Uuid::new_v4().simple());
                        let msg = IpcMessage::Request(IpcRequest::new(
                            req_id,
                            IpcRequestPayload::PtyInput(batch),
                        ));

                        if let Err(e) = write_ipc_message(writer, &msg).await {
                            warn!("PTY input write failed: {}", e);
                            writer_opt = None; // Reset so next packet reconnects
                            break;
                        }
                    }
                }
            }
        });

        Self {
            socket_path,
            input_tx,
        }
    }

    pub async fn send_request(&self, payload: IpcRequestPayload) -> Result<IpcResponsePayload, String> {
        let mut stream = UnixStream::connect(&self.socket_path).await.map_err(|e| {
            format!("Cannot connect to aetherd at {}: {}", self.socket_path.display(), e)
        })?;

        let req_id = format!("gui_{}", Uuid::new_v4().simple());
        let msg = IpcMessage::Request(IpcRequest::new(req_id.clone(), payload));

        write_ipc_message(&mut stream, &msg).await.map_err(|e| e.to_string())?;

        loop {
            let resp_msg = read_ipc_message(&mut stream).await.map_err(|e| e.to_string())?;

            match resp_msg {
                IpcMessage::Response(res) if res.reply_to == req_id => match res.payload {
                    Ok(success) => return Ok(success),
                    Err(err) => return Err(format!("[{}] {}", err.code, err.message)),
                },
                IpcMessage::Response(_) => continue,
                IpcMessage::Event(_) => continue,
                other => return Err(format!("Unexpected response: {:?}", other)),
            }
        }
    }
}

/// Spawns background listener streaming events from aetherd into Tauri webview
pub fn start_event_listener(app_handle: AppHandle) {
    ensure_daemon_running();
    let socket_path = resolve_socket_path();

    tauri::async_runtime::spawn(async move {
        loop {
            match UnixStream::connect(&socket_path).await {
                Ok(mut stream) => {
                    info!("Connected GUI event bridge to aetherd at {}", socket_path.display());

                    // Send SubscribeEvents request
                    let sub_req = IpcMessage::Request(IpcRequest::new(
                        "sub_events",
                        IpcRequestPayload::SubscribeEvents { workspace_id: None },
                    ));
                    if let Err(e) = write_ipc_message(&mut stream, &sub_req).await {
                        warn!("Failed to send SubscribeEvents: {}", e);
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        continue;
                    }

                    // Channel to decouple socket reader from the 16ms/32KB flush batcher
                    let (event_tx, event_rx) = tokio::sync::mpsc::channel::<IpcMessage>(1024);
                    let (mut read_half, _write_half) = stream.into_split();

                    let reader_handle = tauri::async_runtime::spawn(async move {
                        loop {
                            match read_ipc_message(&mut read_half).await {
                                Ok(msg) => {
                                    if event_tx.send(msg).await.is_err() {
                                        break;
                                    }
                                }
                                Err(e) => {
                                    warn!("GUI event stream disconnected: {}", e);
                                    break;
                                }
                            }
                        }
                    });

                    // 16ms interval (~60 FPS) and 32KB batch threshold
                    process_event_stream(
                        event_rx,
                        |event_name, event| {
                            let _ = app_handle.emit(event_name, &event);
                        },
                        32 * 1024,
                        16,
                    )
                    .await;

                    reader_handle.abort();
                }
                Err(_) => {
                    // Daemon may be starting up, retry after delay
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            }
        }
    });
}

/// Backpressure Mitigation & Chunk Batching:
/// Batches PTY output chunks per pane up to `chunk_threshold` (e.g. 32KB)
/// or flushes on a `flush_interval_ms` timer (e.g. 16ms / ~60 FPS).
pub async fn process_event_stream<F>(
    mut event_rx: tokio::sync::mpsc::Receiver<IpcMessage>,
    mut emit_fn: F,
    chunk_threshold: usize,
    flush_interval_ms: u64,
) where
    F: FnMut(&str, IpcEvent),
{
    let mut pane_buffers: HashMap<String, Vec<u8>> = HashMap::new();
    let start = tokio::time::Instant::now() + std::time::Duration::from_millis(flush_interval_ms);
    let mut flush_interval = tokio::time::interval_at(start, std::time::Duration::from_millis(flush_interval_ms));
    flush_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = flush_interval.tick() => {
                for (pane_id, buf) in pane_buffers.iter_mut() {
                    if !buf.is_empty() {
                        let event = IpcEvent::PtyOutput {
                            pane_id: pane_id.clone(),
                            data: std::mem::take(buf),
                        };
                        emit_fn("aether:event", event);
                    }
                }
            }
            msg_opt = event_rx.recv() => {
                match msg_opt {
                    Some(IpcMessage::Event(IpcEvent::PtyOutput { pane_id, data })) => {
                        let buf = pane_buffers.entry(pane_id.clone()).or_default();
                        buf.extend(data);

                        // Adaptive draining: drain any already queued messages
                        let mut non_pty_events = Vec::new();
                        while let Ok(next_msg) = event_rx.try_recv() {
                            match next_msg {
                                IpcMessage::Event(IpcEvent::PtyOutput { pane_id: next_id, data: next_data }) => {
                                    let b = pane_buffers.entry(next_id).or_default();
                                    b.extend(next_data);
                                    if b.len() >= chunk_threshold {
                                        break;
                                    }
                                }
                                IpcMessage::Event(other) => {
                                    non_pty_events.push(other);
                                }
                                _ => {}
                            }
                        }

                        // Flush all pane buffers immediately if channel is now drained or threshold reached
                        for (pid, p_buf) in pane_buffers.iter_mut() {
                            if !p_buf.is_empty() {
                                let event = IpcEvent::PtyOutput {
                                    pane_id: pid.clone(),
                                    data: std::mem::take(p_buf),
                                };
                                emit_fn("aether:event", event);
                            }
                        }

                        // Emit any non-pty events that were interleaved
                        for ev in non_pty_events {
                            emit_fn("aether:event", ev);
                        }
                    }
                    Some(IpcMessage::Event(event)) => {
                        // If a pane exited, flush any pending PTY output for that pane first
                        if let IpcEvent::PaneExited { ref pane_id, .. } = event {
                            if let Some(buf) = pane_buffers.get_mut(pane_id) {
                                if !buf.is_empty() {
                                    let pty_event = IpcEvent::PtyOutput {
                                        pane_id: pane_id.clone(),
                                        data: std::mem::take(buf),
                                    };
                                    emit_fn("aether:event", pty_event);
                                }
                            }
                        }
                        emit_fn("aether:event", event);
                    }
                    Some(_) => {}
                    None => {
                        // Channel closed: flush all remaining buffers
                        for (pane_id, buf) in pane_buffers.drain() {
                            if !buf.is_empty() {
                                let event = IpcEvent::PtyOutput { pane_id, data: buf };
                                emit_fn("aether:event", event);
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------------
// Tauri Commands callable from SolidJS / React
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_spawn_pane(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    cli_type: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    working_dir: Option<String>,
    isolated_worktree: bool,
    cols: u16,
    rows: u16,
) -> Result<PaneSpawnedInfo, String> {
    let parsed_cli = cli_type.parse::<CliType>().unwrap_or(CliType::Shell);
    let home_dir = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = working_dir
        .filter(|s| !s.trim().is_empty() && s != ".")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap_or(home_dir)
        });

    let req = IpcRequestPayload::SpawnPane(SpawnPaneRequest {
        pane_id: None,
        workspace_id,
        cli_type: parsed_cli,
        command,
        args: args.unwrap_or_default(),
        working_dir: dir,
        cols,
        rows,
        isolated_worktree,
        env_vars: HashMap::new(),
    });

    match state.send_request(req).await? {
        IpcResponsePayload::PaneSpawned(info) => Ok(info),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_send_pty_input(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    tracing::debug!("cmd_send_pty_input for pane {}: {} bytes", pane_id, data.len());
    state
        .input_tx
        .send(PtyInputRequest { pane_id, data })
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_resize_pane(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let req = IpcRequestPayload::ResizePane(ResizePaneRequest { pane_id, cols, rows });
    state.send_request(req).await?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_kill_pane(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    signal: Option<i32>,
) -> Result<(), String> {
    let req = IpcRequestPayload::KillPane(aether_protocol::ipc::KillPaneRequest { pane_id, signal });
    state.send_request(req).await?;
    Ok(())
}

#[tauri::command]
pub fn cmd_check_pane_process(pid: u32, cli_type: String) -> Option<String> {
    if pid == 0 {
        return None;
    }

    // 1. Check if the spawned command itself is a specialized agent CLI
    let is_generic_shell = matches!(
        cli_type.to_lowercase().as_str(),
        "shell" | "bash" | "fish" | "zsh" | "sh"
    );
    if !is_generic_shell {
        return Some(cli_type);
    }

    // 2. Inspect Linux process tree for running child processes (e.g. npm, node, cargo, python, claude)
    #[cfg(target_os = "linux")]
    {
        let children_path = format!("/proc/{pid}/task/{pid}/children");
        if let Ok(content) = std::fs::read_to_string(children_path) {
            for part in content.split_whitespace() {
                if let Ok(child_pid) = part.parse::<u32>() {
                    if let Ok(comm) = std::fs::read_to_string(format!("/proc/{child_pid}/comm")) {
                        let name = comm.trim().to_string();
                        if !name.is_empty() {
                            return Some(name);
                        }
                    }
                }
            }
        }
    }

    None
}

#[tauri::command]
pub async fn cmd_list_panes(
    state: State<'_, GuiBridgeState>,
    workspace_id: Option<String>,
) -> Result<Vec<PaneSummary>, String> {
    let req = IpcRequestPayload::ListPanes { workspace_id };
    match state.send_request(req).await? {
        IpcResponsePayload::PaneList(list) => Ok(list),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_get_shared_context(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    query: Option<String>,
) -> Result<SharedContextSummary, String> {
    let req = IpcRequestPayload::GetSharedContext(aether_protocol::ipc::GetSharedContextRequest {
        workspace_id,
        query,
    });
    match state.send_request(req).await? {
        IpcResponsePayload::SharedContext(ctx) => Ok(ctx),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_publish_blackboard(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    author_agent_id: String,
    entry_type: String,
    title: String,
    content_markdown: String,
    target_agent_id: Option<String>,
) -> Result<i64, String> {
    let parsed_type = entry_type
        .parse::<BlackboardEntryType>()
        .unwrap_or(BlackboardEntryType::Decision);

    let req = IpcRequestPayload::PublishBlackboard(PublishBlackboardRequest {
        workspace_id,
        author_agent_id,
        entry_type: parsed_type,
        title,
        content_markdown,
        target_agent_id,
    });

    match state.send_request(req).await? {
        IpcResponsePayload::BlackboardPublished { entry_id } => Ok(entry_id),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_claim_module(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    agent_id: String,
    files: Vec<String>,
    intent: Option<String>,
) -> Result<(bool, Vec<String>), String> {
    let req = IpcRequestPayload::ClaimModule(ClaimModuleRequest {
        workspace_id,
        agent_id,
        files,
        intent,
    });

    match state.send_request(req).await? {
        IpcResponsePayload::ModuleClaimed { granted, conflicts } => Ok((granted, conflicts)),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_release_module(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    agent_id: String,
    files: Vec<String>,
) -> Result<(), String> {
    let req = IpcRequestPayload::ReleaseModule(ReleaseModuleRequest {
        workspace_id,
        agent_id,
        files,
    });
    state.send_request(req).await?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_worktree_diff(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    target_branch: Option<String>,
) -> Result<WorktreeDiffSummary, String> {
    let req = IpcRequestPayload::WorktreeDiff(WorktreeDiffRequest { pane_id, target_branch });
    match state.send_request(req).await? {
        IpcResponsePayload::WorktreeDiff(diff) => Ok(diff),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_merge_worktree(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    target_branch: Option<String>,
    squash: bool,
    commit_message: Option<String>,
) -> Result<String, String> {
    let req = IpcRequestPayload::MergeWorktree(MergeWorktreeRequest {
        pane_id,
        target_branch,
        squash,
        commit_message,
    });
    match state.send_request(req).await? {
        IpcResponsePayload::WorktreeMerged { commit_oid } => Ok(commit_oid),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_create_snapshot(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    summary: String,
) -> Result<String, String> {
    let req = IpcRequestPayload::CreateSnapshot(CreateSnapshotRequest { pane_id, summary });
    match state.send_request(req).await? {
        IpcResponsePayload::SnapshotCreated { snapshot_id, .. } => Ok(snapshot_id),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_rollback_snapshot(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    let req = IpcRequestPayload::RollbackSnapshot(RollbackSnapshotRequest { pane_id, snapshot_id });
    state.send_request(req).await?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_list_snapshots(
    state: State<'_, GuiBridgeState>,
    pane_id: String,
) -> Result<Vec<aether_protocol::agent::GitSnapshotInfo>, String> {
    let req = IpcRequestPayload::ListSnapshots { pane_id };
    match state.send_request(req).await? {
        IpcResponsePayload::SnapshotList(snaps) => Ok(snaps),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_read_obsidian_note(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    query_or_path: String,
) -> Result<String, String> {
    let req = IpcRequestPayload::ObsidianReadNote(ObsidianReadNoteRequest {
        workspace_id,
        query_or_path,
    });
    match state.send_request(req).await? {
        IpcResponsePayload::ObsidianNote(note) => Ok(note.raw_content),
        _ => Err("Could not find note".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_update_obsidian_task(
    state: State<'_, GuiBridgeState>,
    workspace_id: String,
    note_path: String,
    task_text: String,
    completed: bool,
) -> Result<(), String> {
    let req = IpcRequestPayload::ObsidianUpdateTask(ObsidianUpdateTaskRequest {
        workspace_id,
        note_path,
        task_text,
        completed,
    });
    state.send_request(req).await?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_detect_available_tools() -> Result<Vec<crate::tool_detector::DetectedTool>, String> {
    Ok(crate::tool_detector::detect_available_tools())
}

#[tauri::command]
pub async fn cmd_validate_tool(
    binary: String,
    category: Option<String>,
) -> Result<crate::tool_detector::DetectedTool, String> {
    crate::tool_detector::validate_custom_tool(&binary, category.as_deref())
}

pub fn ensure_daemon_running() {
    let socket_path = resolve_socket_path();
    if std::os::unix::net::UnixStream::connect(&socket_path).is_err() {
        let mut candidates = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                candidates.push(parent.join("aetherd"));
                candidates.push(parent.join("../release/aetherd"));
                candidates.push(parent.join("../debug/aetherd"));
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(PathBuf::from(home).join(".local/bin/aetherd"));
        }
        candidates.push(PathBuf::from("/usr/local/bin/aetherd"));
        candidates.push(PathBuf::from("/usr/bin/aetherd"));

        for candidate in candidates {
            if candidate.is_file() {
                info!("Auto-spawning aetherd daemon from {}...", candidate.display());
                let _ = std::process::Command::new(&candidate)
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn();
                std::thread::sleep(std::time::Duration::from_millis(300));
                break;
            }
        }
    }
}

pub fn resolve_socket_path() -> PathBuf {
    if let Ok(path) = std::env::var("AETHER_SOCK").or_else(|_| std::env::var(AETHER_SOCK_ENV)) {
        return PathBuf::from(path);
    }
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        return PathBuf::from(runtime_dir).join(DEFAULT_SOCKET_NAME);
    }
    let uid = unsafe { libc::getuid() };
    PathBuf::from(format!("/run/user/{uid}")).join(DEFAULT_SOCKET_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_process_event_stream_batch_threshold() {
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let emitted = Arc::new(Mutex::new(Vec::new()));
        let emitted_clone = emitted.clone();

        let handle = tokio::spawn(async move {
            process_event_stream(
                rx,
                move |_name, event| {
                    emitted_clone.lock().unwrap().push(event);
                },
                1024, // 1KB threshold for fast test
                100,  // 100ms interval
            )
            .await;
        });

        // Send 600 bytes (below 1KB threshold)
        tx.send(IpcMessage::Event(IpcEvent::PtyOutput {
            pane_id: "pane_1".to_string(),
            data: vec![b'A'; 600],
        }))
        .await
        .unwrap();

        // Give a tiny moment for processing message
        sleep(Duration::from_millis(10)).await;
        // Still below threshold and before 100ms interval
        assert_eq!(emitted.lock().unwrap().len(), 0);

        // Send another 600 bytes -> 1200 bytes total >= 1024 bytes threshold!
        tx.send(IpcMessage::Event(IpcEvent::PtyOutput {
            pane_id: "pane_1".to_string(),
            data: vec![b'B'; 600],
        }))
        .await
        .unwrap();

        sleep(Duration::from_millis(15)).await;
        let lock = emitted.lock().unwrap();
        assert_eq!(lock.len(), 1);
        if let IpcEvent::PtyOutput { pane_id, data } = &lock[0] {
            assert_eq!(pane_id, "pane_1");
            assert_eq!(data.len(), 1200);
            assert_eq!(&data[..600], vec![b'A'; 600].as_slice());
            assert_eq!(&data[600..], vec![b'B'; 600].as_slice());
        } else {
            panic!("Expected PtyOutput event");
        }
        drop(lock);

        drop(tx);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn test_process_event_stream_interval_flush() {
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let emitted = Arc::new(Mutex::new(Vec::new()));
        let emitted_clone = emitted.clone();

        let handle = tokio::spawn(async move {
            process_event_stream(
                rx,
                move |_name, event| {
                    emitted_clone.lock().unwrap().push(event);
                },
                10 * 1024, // 10KB threshold
                20,        // 20ms interval
            )
            .await;
        });

        // Send small 50 bytes (far below threshold)
        tx.send(IpcMessage::Event(IpcEvent::PtyOutput {
            pane_id: "pane_2".to_string(),
            data: b"hello interval".to_vec(),
        }))
        .await
        .unwrap();

        // Before interval: empty
        sleep(Duration::from_millis(5)).await;
        assert_eq!(emitted.lock().unwrap().len(), 0);

        // After interval (>= 25ms): should be flushed
        sleep(Duration::from_millis(30)).await;
        let lock = emitted.lock().unwrap();
        assert_eq!(lock.len(), 1);
        if let IpcEvent::PtyOutput { pane_id, data } = &lock[0] {
            assert_eq!(pane_id, "pane_2");
            assert_eq!(data.as_slice(), b"hello interval");
        } else {
            panic!("Expected PtyOutput event");
        }
        drop(lock);

        drop(tx);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn test_process_event_stream_pane_exit_order() {
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let emitted = Arc::new(Mutex::new(Vec::new()));
        let emitted_clone = emitted.clone();

        let handle = tokio::spawn(async move {
            process_event_stream(
                rx,
                move |_name, event| {
                    emitted_clone.lock().unwrap().push(event);
                },
                10 * 1024,
                200,
            )
            .await;
        });

        // Send small data
        tx.send(IpcMessage::Event(IpcEvent::PtyOutput {
            pane_id: "pane_3".to_string(),
            data: b"final output".to_vec(),
        }))
        .await
        .unwrap();

        // Immediately send PaneExited
        tx.send(IpcMessage::Event(IpcEvent::PaneExited {
            pane_id: "pane_3".to_string(),
            exit_code: Some(0),
        }))
        .await
        .unwrap();

        sleep(Duration::from_millis(15)).await;

        let lock = emitted.lock().unwrap();
        assert_eq!(lock.len(), 2);
        // First event must be the flushed PtyOutput
        match &lock[0] {
            IpcEvent::PtyOutput { pane_id, data } => {
                assert_eq!(pane_id, "pane_3");
                assert_eq!(data.as_slice(), b"final output");
            }
            other => panic!("Expected PtyOutput, got {:?}", other),
        }
        // Second event must be PaneExited
        match &lock[1] {
            IpcEvent::PaneExited { pane_id, exit_code } => {
                assert_eq!(pane_id, "pane_3");
                assert_eq!(*exit_code, Some(0));
            }
            other => panic!("Expected PaneExited, got {:?}", other),
        }
        drop(lock);

        drop(tx);
        let _ = handle.await;
    }
}
