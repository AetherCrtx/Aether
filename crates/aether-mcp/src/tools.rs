use aether_protocol::agent::BlackboardEntryType;
use aether_protocol::ipc::async_codec::{read_ipc_message, write_ipc_message};
use aether_protocol::ipc::{
    ClaimModuleRequest, CreateSnapshotRequest, DelegateTaskRequest, GetSharedContextRequest, IpcMessage,
    IpcRequest, IpcRequestPayload, IpcResponsePayload, ObsidianAppendMemoryRequest,
    ObsidianReadNoteRequest, ObsidianUpdateTaskRequest, PublishBlackboardRequest, ReleaseModuleRequest,
};
use aether_protocol::mcp::{
    ClaimModuleArgs, CreateSnapshotArgs, DelegateTaskArgs, GetSharedContextArgs, McpToolResult,
    ObsidianAppendMemoryArgs, ObsidianReadNoteArgs, ObsidianUpdateTaskArgs, PublishBlackboardArgs,
    ReleaseModuleArgs,
};
use serde_json::Value;
use tokio::net::UnixStream;
use uuid::Uuid;

pub struct McpToolHandler {
    socket_path: String,
    workspace_id: String,
    agent_id: String,
}

impl McpToolHandler {
    pub fn new(socket_path: impl Into<String>, workspace_id: impl Into<String>, agent_id: impl Into<String>) -> Self {
        Self {
            socket_path: socket_path.into(),
            workspace_id: workspace_id.into(),
            agent_id: agent_id.into(),
        }
    }

    /// Dispatch tool calls by name
    pub async fn handle_tool_call(&self, tool_name: &str, arguments: Option<Value>) -> McpToolResult {
        let args = arguments.unwrap_or(Value::Object(serde_json::Map::new()));

        match tool_name {
            "aether_get_shared_context" => {
                let parsed: GetSharedContextArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.get_shared_context(parsed).await
            }

            "aether_claim_module" => {
                let parsed: ClaimModuleArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.claim_module(parsed).await
            }

            "aether_publish_blackboard" => {
                let parsed: PublishBlackboardArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.publish_blackboard(parsed).await
            }

            "aether_delegate_task" => {
                let parsed: DelegateTaskArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.delegate_task(parsed).await
            }

            "obsidian_read_note" => {
                let parsed: ObsidianReadNoteArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.obsidian_read_note(parsed).await
            }

            "obsidian_update_task" => {
                let parsed: ObsidianUpdateTaskArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.obsidian_update_task(parsed).await
            }

            "obsidian_append_memory" => {
                let parsed: ObsidianAppendMemoryArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.obsidian_append_memory(parsed).await
            }

            "aether_release_module" => {
                let parsed: ReleaseModuleArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.release_module(parsed).await
            }

            "aether_create_snapshot" => {
                let parsed: CreateSnapshotArgs = match serde_json::from_value(args) {
                    Ok(a) => a,
                    Err(e) => return McpToolResult::error(format!("Invalid arguments: {e}")),
                };
                self.create_snapshot(parsed).await
            }

            unknown => McpToolResult::error(format!("Unknown tool: {unknown}")),
        }
    }

    /// Connect to aetherd Unix socket and execute a request-response transaction
    async fn send_daemon_request(&self, payload: IpcRequestPayload) -> Result<IpcResponsePayload, String> {
        let mut stream = UnixStream::connect(&self.socket_path).await.map_err(|e| {
            format!(
                "Failed to connect to aetherd daemon socket at {}: {}",
                self.socket_path, e
            )
        })?;

        let req_id = format!("mcp_{}", Uuid::new_v4().simple());
        let request_msg = IpcMessage::Request(IpcRequest::new(req_id.clone(), payload));

        write_ipc_message(&mut stream, &request_msg).await.map_err(|e| {
            format!("Failed to send request to aetherd: {e}")
        })?;

        let response_msg = read_ipc_message(&mut stream).await.map_err(|e| {
            format!("Failed to read response from aetherd: {e}")
        })?;

        match response_msg {
            IpcMessage::Response(res) => {
                if res.reply_to != req_id {
                    return Err(format!("Correlation ID mismatch: expected {req_id}, got {}", res.reply_to));
                }
                match res.payload {
                    Ok(success) => Ok(success),
                    Err(err) => Err(format!("[{}] {}", err.code, err.message)),
                }
            }
            other => Err(format!("Unexpected message from daemon: {:?}", other)),
        }
    }

    // ------------------------------------------------------------------------
    // Tool Implementations
    // ------------------------------------------------------------------------

    async fn get_shared_context(&self, args: GetSharedContextArgs) -> McpToolResult {
        let req = IpcRequestPayload::GetSharedContext(GetSharedContextRequest {
            workspace_id: self.workspace_id.clone(),
            query: args.query,
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::SharedContext(ctx)) => {
                let mut out = String::new();
                out.push_str("# AetherTerminal Shared Brain Context\n\n");

                // 1. File Locks
                out.push_str("## Active Advisory File Locks\n");
                if ctx.active_file_locks.is_empty() {
                    out.push_str("_No files are currently locked by parallel agents._\n\n");
                } else {
                    for lock in ctx.active_file_locks {
                        out.push_str(&format!(
                            "- **`{}`** (Held by `@agent_{}`): {}\n",
                            lock.relative_file_path,
                            lock.locked_by_agent_id,
                            lock.intent.unwrap_or_else(|| "Modifying code".to_string())
                        ));
                    }
                    out.push('\n');
                }

                // 2. Blackboard Entries
                out.push_str("## Shared Blackboard (Active Architectural Contracts & Decisions)\n");
                if ctx.blackboard_entries.is_empty() {
                    out.push_str("_No active blackboard entries._\n\n");
                } else {
                    for entry in ctx.blackboard_entries {
                        out.push_str(&format!(
                            "### [{}] {} (by @agent_{})\n{}\n\n",
                            entry.entry_type, entry.title, entry.author_agent_id, entry.content_markdown
                        ));
                    }
                }

                // 3. Relevant Obsidian Notes
                if !ctx.relevant_notes.is_empty() {
                    out.push_str("## Relevant Architectural Notes from Obsidian Vault\n");
                    for note in ctx.relevant_notes {
                        out.push_str(&format!(
                            "### Note: {}\n**Path:** `{}`\n\n{}\n\n---\n\n",
                            note.title, note.relative_path, note.raw_content
                        ));
                    }
                }

                McpToolResult::text(out)
            }
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn claim_module(&self, args: ClaimModuleArgs) -> McpToolResult {
        let req = IpcRequestPayload::ClaimModule(ClaimModuleRequest {
            workspace_id: self.workspace_id.clone(),
            agent_id: self.agent_id.clone(),
            files: args.files.clone(),
            intent: Some(args.intent),
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::ModuleClaimed { granted, conflicts }) => {
                if granted {
                    McpToolResult::text(format!(
                        "Lock granted! You have registered advisory locks for {} files: {:?}",
                        args.files.len(),
                        args.files
                    ))
                } else {
                    McpToolResult::error(format!(
                        "Lock conflict detected! The following files are already being modified by another agent: {:?}",
                        conflicts
                    ))
                }
            }
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn publish_blackboard(&self, args: PublishBlackboardArgs) -> McpToolResult {
        let entry_type = args
            .entry_type
            .parse::<BlackboardEntryType>()
            .unwrap_or(BlackboardEntryType::Decision);

        let req = IpcRequestPayload::PublishBlackboard(PublishBlackboardRequest {
            workspace_id: self.workspace_id.clone(),
            author_agent_id: self.agent_id.clone(),
            entry_type,
            title: args.title,
            content_markdown: args.content_markdown,
            target_agent_id: args.target_agent_id,
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::BlackboardPublished { entry_id }) => McpToolResult::text(format!(
                "Successfully published entry #{} to the shared blackboard! Parallel agent panes have been notified.",
                entry_id
            )),
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn delegate_task(&self, args: DelegateTaskArgs) -> McpToolResult {
        let req = IpcRequestPayload::DelegateTask(DelegateTaskRequest {
            workspace_id: self.workspace_id.clone(),
            caller_agent_id: self.agent_id.clone(),
            target_cli: args.target_cli,
            prompt: args.prompt,
            mode: args.mode,
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::TaskDelegated { result_output }) => {
                McpToolResult::text(result_output)
            }
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn obsidian_read_note(&self, args: ObsidianReadNoteArgs) -> McpToolResult {
        let req = IpcRequestPayload::ObsidianReadNote(ObsidianReadNoteRequest {
            workspace_id: self.workspace_id.clone(),
            query_or_path: args.query_or_path.clone(),
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::ObsidianNote(note)) => {
                let mut out = format!("# {}\n**Path:** `{}`\n\n", note.title, note.relative_path);
                if let Some(fm) = note.frontmatter_json {
                    out.push_str(&format!("_Frontmatter:_ `{}`\n\n", fm));
                }
                out.push_str(&note.raw_content);
                McpToolResult::text(out)
            }
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(format!("Could not read note '{}': {}", args.query_or_path, e)),
        }
    }

    async fn obsidian_update_task(&self, args: ObsidianUpdateTaskArgs) -> McpToolResult {
        let req = IpcRequestPayload::ObsidianUpdateTask(ObsidianUpdateTaskRequest {
            workspace_id: self.workspace_id.clone(),
            note_path: args.note_path.clone(),
            task_text: args.task_text.clone(),
            completed: args.completed,
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::ObsidianTaskUpdated) => McpToolResult::text(format!(
                "Task '{}' in note '{}' successfully marked as {}.",
                args.task_text,
                args.note_path,
                if args.completed { "completed [x]" } else { "pending [ ]" }
            )),
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn obsidian_append_memory(&self, args: ObsidianAppendMemoryArgs) -> McpToolResult {
        let req = IpcRequestPayload::ObsidianAppendMemory(ObsidianAppendMemoryRequest {
            workspace_id: self.workspace_id.clone(),
            folder: args.folder.clone(),
            title: args.title.clone(),
            markdown: args.markdown,
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::ObsidianMemoryAppended) => McpToolResult::text(format!(
                "Successfully saved note '{}' to Obsidian folder '{}'!",
                args.title, args.folder
            )),
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn release_module(&self, args: ReleaseModuleArgs) -> McpToolResult {
        let req = IpcRequestPayload::ReleaseModule(ReleaseModuleRequest {
            workspace_id: self.workspace_id.clone(),
            agent_id: self.agent_id.clone(),
            files: args.files.clone(),
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::ModuleReleased) => McpToolResult::text(format!(
                "Released advisory locks for {} files: {:?}",
                args.files.len(),
                args.files
            )),
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }

    async fn create_snapshot(&self, args: CreateSnapshotArgs) -> McpToolResult {
        let req = IpcRequestPayload::CreateSnapshot(CreateSnapshotRequest {
            pane_id: self.agent_id.clone(),
            summary: args.summary.clone(),
        });

        match self.send_daemon_request(req).await {
            Ok(IpcResponsePayload::SnapshotCreated {
                snapshot_id,
                git_tree_oid,
            }) => McpToolResult::text(format!(
                "Snapshot '{}' created ({}). Tree: {}. Restore it later with aether_rollback via the GUI Time Travel slider.",
                args.summary, snapshot_id, git_tree_oid
            )),
            Ok(_) => McpToolResult::error("Unexpected response payload from daemon"),
            Err(e) => McpToolResult::error(e),
        }
    }
}
