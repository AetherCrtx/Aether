pub mod tools;

use aether_protocol::mcp::{all_aether_mcp_tools, JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use aether_protocol::{AETHER_SOCK_ENV, DEFAULT_SOCKET_NAME};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tools::McpToolHandler;
use tracing::debug;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Note: Do NOT log to stdout because stdout is reserved for JSON-RPC 2.0 messages!
    // Stderr logging only:
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("aether_mcp=info")),
        )
        .init();

    debug!("Starting AetherTerminal MCP Server (stdio mode)...");

    let socket_path = resolve_socket_path();
    let workspace_id = std::env::var("AETHER_WORKSPACE_ID").unwrap_or_else(|_| "default".to_string());
    let agent_id = std::env::var("AETHER_AGENT_ID").unwrap_or_else(|_| "claude-code".to_string());

    debug!(
        "Connecting to daemon at '{}' (workspace: {}, agent: {})",
        socket_path.display(),
        workspace_id,
        agent_id
    );

    let handler = Arc::new(McpToolHandler::new(
        socket_path.to_string_lossy().to_string(),
        workspace_id,
        agent_id,
    ));

    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let request: JsonRpcRequest = match serde_json::from_str(trimmed) {
            Ok(req) => req,
            Err(e) => {
                let err_resp = JsonRpcResponse::error(
                    serde_json::Value::Null,
                    JsonRpcError::invalid_request(format!("Malformed JSON: {e}")),
                );
                send_response(&mut stdout, &err_resp).await?;
                continue;
            }
        };

        // Handle notifications (no response required)
        if request.id.is_null() && request.method.starts_with("notifications/") {
            debug!("Received notification: {}", request.method);
            continue;
        }

        let req_id = request.id.clone();
        let response = match request.method.as_str() {
            "initialize" => {
                let init_result = json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {
                            "listChanged": false
                        }
                    },
                    "serverInfo": {
                        "name": "aether-mcp",
                        "version": "0.1.0"
                    }
                });
                JsonRpcResponse::success(req_id, init_result)
            }

            "notifications/initialized" => {
                continue;
            }

            "ping" => JsonRpcResponse::success(req_id, json!({})),

            "tools/list" => {
                let tools = all_aether_mcp_tools();
                JsonRpcResponse::success(req_id, json!({ "tools": tools }))
            }

            "tools/call" => {
                if let Some(params) = request.params {
                    let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let tool_args = params.get("arguments").cloned();

                    let tool_result = handler.handle_tool_call(tool_name, tool_args).await;
                    let result_value = serde_json::to_value(&tool_result)
                        .unwrap_or_else(|_| json!({ "content": [], "isError": true }));

                    JsonRpcResponse::success(req_id, result_value)
                } else {
                    JsonRpcResponse::error(
                        req_id,
                        JsonRpcError::invalid_params("Missing 'params' for tools/call"),
                    )
                }
            }

            other => JsonRpcResponse::error(req_id, JsonRpcError::method_not_found(other)),
        };

        send_response(&mut stdout, &response).await?;
    }

    debug!("AetherTerminal MCP server shutting down (stdin EOF reached).");
    Ok(())
}

async fn send_response(
    stdout: &mut tokio::io::Stdout,
    response: &JsonRpcResponse,
) -> Result<(), std::io::Error> {
    let mut serialized = serde_json::to_string(response)?;
    serialized.push('\n');
    stdout.write_all(serialized.as_bytes()).await?;
    stdout.flush().await?;
    Ok(())
}

fn resolve_socket_path() -> PathBuf {
    if let Ok(path) = std::env::var("AETHER_SOCK").or_else(|_| std::env::var(AETHER_SOCK_ENV)) {
        return PathBuf::from(path);
    }

    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        return PathBuf::from(runtime_dir).join(DEFAULT_SOCKET_NAME);
    }

    let uid = unsafe { libc::getuid() };
    let run_user = PathBuf::from(format!("/run/user/{uid}"));
    if run_user.is_dir() {
        return run_user.join(DEFAULT_SOCKET_NAME);
    }

    PathBuf::from(format!("/tmp/aether-{uid}.sock"))
}
