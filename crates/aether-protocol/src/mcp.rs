use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Standard JSON-RPC 2.0 Request
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

impl JsonRpcRequest {
    pub fn new(id: Value, method: impl Into<String>, params: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.into(),
            params,
        }
    }
}

/// Standard JSON-RPC 2.0 Response
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

impl JsonRpcResponse {
    pub fn success(id: Value, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Value, error: JsonRpcError) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(error),
        }
    }
}

/// Standard JSON-RPC 2.0 Error
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl JsonRpcError {
    pub fn invalid_request(msg: impl Into<String>) -> Self {
        Self {
            code: -32600,
            message: msg.into(),
            data: None,
        }
    }

    pub fn method_not_found(method: &str) -> Self {
        Self {
            code: -32601,
            message: format!("Method not found: {method}"),
            data: None,
        }
    }

    pub fn invalid_params(msg: impl Into<String>) -> Self {
        Self {
            code: -32602,
            message: msg.into(),
            data: None,
        }
    }

    pub fn internal_error(msg: impl Into<String>) -> Self {
        Self {
            code: -32603,
            message: msg.into(),
            data: None,
        }
    }
}

/// Model Context Protocol (MCP) Tool Definition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

/// Model Context Protocol (MCP) Content block
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContent {
    Text { text: String },
    Image { data: String, mime_type: String },
    Resource { uri: String, text: Option<String> },
}

/// Model Context Protocol (MCP) Tool Call result
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct McpToolResult {
    pub content: Vec<McpContent>,
    #[serde(rename = "isError", default)]
    pub is_error: bool,
}

impl McpToolResult {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            content: vec![McpContent::Text { text: text.into() }],
            is_error: false,
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            content: vec![McpContent::Text { text: msg.into() }],
            is_error: true,
        }
    }
}

// ----------------------------------------------------------------------------
// Tool-Specific Argument Payloads
// ----------------------------------------------------------------------------

/// Tool 1: aether_get_shared_context
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct GetSharedContextArgs {
    pub query: Option<String>,
}

/// Tool 2: aether_claim_module
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClaimModuleArgs {
    pub files: Vec<String>,
    pub intent: String,
}

/// Tool 3: aether_publish_blackboard
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PublishBlackboardArgs {
    #[serde(rename = "type", alias = "entry_type")]
    pub entry_type: String,
    pub title: String,
    #[serde(alias = "content")]
    pub content_markdown: String,
    pub target_agent_id: Option<String>,
}

/// Tool 4: aether_delegate_task
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DelegateTaskArgs {
    pub target_cli: String,
    pub prompt: String,
    #[serde(default = "default_delegation_mode")]
    pub mode: String, // "headless" | "pane"
}

fn default_delegation_mode() -> String {
    "headless".to_string()
}

/// Tool 5: obsidian_read_note
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ObsidianReadNoteArgs {
    #[serde(alias = "path_or_query")]
    pub query_or_path: String,
}

/// Tool 6: obsidian_update_task
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ObsidianUpdateTaskArgs {
    pub note_path: String,
    pub task_text: String,
    pub completed: bool,
}

/// Tool 7: obsidian_append_memory
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ObsidianAppendMemoryArgs {
    #[serde(default = "default_folder")]
    pub folder: String,
    pub title: String,
    pub markdown: String,
}

fn default_folder() -> String {
    "Architecture".to_string()
}

/// Tool 8: aether_release_module
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReleaseModuleArgs {
    pub files: Vec<String>,
}

/// Tool 9: aether_create_snapshot
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateSnapshotArgs {
    pub summary: String,
}

/// Predefined tool catalog for all Aether MCP tools
pub fn all_aether_mcp_tools() -> Vec<McpTool> {
    vec![
        McpTool {
            name: "aether_get_shared_context".to_string(),
            description: "Returns active blackboard entries (architectural decisions, contracts), current advisory file locks held by other panes, and relevant Obsidian notes.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional search term to filter relevant context and notes"
                    }
                }
            }),
        },
        McpTool {
            name: "aether_claim_module".to_string(),
            description: "Registers an advisory file lock in the shared brain so parallel agent panes know you are refactoring or writing to these files.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["files", "intent"],
                "properties": {
                    "files": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "List of relative file paths to claim"
                    },
                    "intent": {
                        "type": "string",
                        "description": "Short explanation of the changes planned (e.g., 'Refactoring JWT verification')"
                    }
                }
            }),
        },
        McpTool {
            name: "aether_publish_blackboard".to_string(),
            description: "Broadcasts an API contract, task claim, bug report, architectural decision, or handoff to the shared brain, notifying other agents.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["type", "title", "content"],
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["API_CONTRACT", "TASK_CLAIM", "BUG_REPORT", "DECISION", "HANDOFF"],
                        "description": "The category of the blackboard entry"
                    },
                    "title": {
                        "type": "string",
                        "description": "Concise summary title"
                    },
                    "content": {
                        "type": "string",
                        "description": "Detailed markdown specifications, schemas, or instructions"
                    },
                    "target_agent_id": {
                        "type": "string",
                        "description": "Optional specific target agent pane ID, or omit to broadcast to all agents"
                    }
                }
            }),
        },
        McpTool {
            name: "aether_delegate_task".to_string(),
            description: "Allows this agent to invoke another agent CLI (e.g. asking Codex to write a benchmark or OpenCode to check security) and receive the structured result.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["target_cli", "prompt"],
                "properties": {
                    "target_cli": {
                        "type": "string",
                        "description": "The target CLI name (e.g., 'codex', 'opencode', 'claude-code')"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "The specific task prompt or instructions for the sub-agent"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["headless", "pane"],
                        "default": "headless",
                        "description": "Execution mode: headless background process or open in an interactive GUI pane"
                    }
                }
            }),
        },
        McpTool {
            name: "obsidian_read_note".to_string(),
            description: "Searches and retrieves markdown notes from the user's linked Obsidian Vault using title, relative path, or full-text query.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["query_or_path"],
                "properties": {
                    "query_or_path": {
                        "type": "string",
                        "description": "Relative file path (e.g., 'Architecture/Auth-Flow.md') or full-text search phrase"
                    }
                }
            }),
        },
        McpTool {
            name: "obsidian_update_task".to_string(),
            description: "Toggles a markdown task checkbox ('- [ ]' to '- [x]' or vice-versa) in an Obsidian note such as a sprint plan.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["note_path", "task_text", "completed"],
                "properties": {
                    "note_path": {
                        "type": "string",
                        "description": "Relative path to the note in the Obsidian vault"
                    },
                    "task_text": {
                        "type": "string",
                        "description": "Exact text of the task item to toggle"
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "True to mark completed '- [x]', false to mark uncompleted '- [ ]'"
                    }
                }
            }),
        },
        McpTool {
            name: "obsidian_append_memory".to_string(),
            description: "Appends architectural notes, decision records, or sprint logs directly into a section or note within the Obsidian Vault.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["folder", "title", "markdown"],
                "properties": {
                    "folder": {
                        "type": "string",
                        "description": "Folder within the vault (e.g. 'Architecture', 'Decisions', 'Logs')"
                    },
                    "title": {
                        "type": "string",
                        "description": "Note title or filename"
                    },
                    "markdown": {
                        "type": "string",
                        "description": "Markdown content to append"
                    }
                }
            }),
        },
        McpTool {
            name: "aether_release_module".to_string(),
            description: "Releases advisory file locks previously claimed via aether_claim_module so parallel agent panes can edit those files again.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["files"],
                "properties": {
                    "files": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "List of relative file paths to release"
                    }
                }
            }),
        },
        McpTool {
            name: "aether_create_snapshot".to_string(),
            description: "Captures a time-travel safety checkpoint of the current worktree state so changes can be rolled back later without polluting the git log.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["summary"],
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Short description of the checkpoint (e.g. 'Before refactoring auth middleware')"
                    }
                }
            }),
        },
    ]
}
