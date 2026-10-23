use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;

/// Supported CLI Agent Types in AetherTerminal
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CliType {
    ClaudeCode,
    OpenCode,
    Codex,
    Antigravity,
    Hermes,
    Shell,
    Custom(String),
}

impl CliType {
    pub fn as_str(&self) -> &str {
        match self {
            CliType::ClaudeCode => "claude-code",
            CliType::OpenCode => "opencode",
            CliType::Codex => "codex",
            CliType::Antigravity => "antigravity",
            CliType::Hermes => "hermes",
            CliType::Shell => "shell",
            CliType::Custom(s) => s.as_str(),
        }
    }
}

impl fmt::Display for CliType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for CliType {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let normalized = s.trim().to_lowercase();
        Ok(match normalized.as_str() {
            "claude-code" | "claude" => CliType::ClaudeCode,
            "opencode" => CliType::OpenCode,
            "codex" => CliType::Codex,
            "antigravity" => CliType::Antigravity,
            "hermes" => CliType::Hermes,
            "shell" | "bash" | "zsh" | "fish" | "sh" => CliType::Shell,
            _ => CliType::Custom(s.to_string()),
        })
    }
}

/// Dynamic Agent State tracked by PTY radar and MCP signals
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AgentStatus {
    #[default]
    Idle,
    Thinking,
    Executing,
    WaitingApproval,
    Error,
}

impl AgentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentStatus::Idle => "IDLE",
            AgentStatus::Thinking => "THINKING",
            AgentStatus::Executing => "EXECUTING",
            AgentStatus::WaitingApproval => "WAITING_APPROVAL",
            AgentStatus::Error => "ERROR",
        }
    }
}

impl fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for AgentStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "IDLE" => Ok(AgentStatus::Idle),
            "THINKING" => Ok(AgentStatus::Thinking),
            "EXECUTING" => Ok(AgentStatus::Executing),
            "WAITING_APPROVAL" => Ok(AgentStatus::WaitingApproval),
            "ERROR" => Ok(AgentStatus::Error),
            other => Err(format!("Unknown agent status: {other}")),
        }
    }
}

/// Declarative profile for an agent CLI
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentProfile {
    pub display_name: String,
    pub binary: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub supports_mcp: bool,
    #[serde(default)]
    pub mcp_injection_strategy: Option<String>,
    #[serde(default)]
    pub mcp_args: Vec<String>,
    #[serde(default)]
    pub headless_args: Vec<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub context_injection_strategy: Option<String>,
}

fn default_color() -> String {
    "#7aa2f7".to_string()
}

/// Global agent settings from config/default_agents.toml
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentsConfig {
    #[serde(default)]
    pub global: GlobalAgentSettings,
    #[serde(default)]
    pub agents: HashMap<String, AgentProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GlobalAgentSettings {
    #[serde(default = "default_true")]
    pub auto_worktree: bool,
    #[serde(default = "default_mcp_path")]
    pub mcp_binary_path: String,
    #[serde(default = "default_sandbox")]
    pub default_sandbox: String,
}

impl Default for GlobalAgentSettings {
    fn default() -> Self {
        Self {
            auto_worktree: true,
            mcp_binary_path: "/usr/local/bin/aether-mcp".to_string(),
            default_sandbox: "workspace-only".to_string(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_mcp_path() -> String {
    "/usr/local/bin/aether-mcp".to_string()
}

fn default_sandbox() -> String {
    "workspace-only".to_string()
}

/// Real-time Telemetry metrics for an active pane
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct AgentTelemetry {
    pub estimated_tokens: u64,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub open_ports: Vec<u16>,
    pub uptime_secs: u64,
}

/// Shared Blackboard Entry Types
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BlackboardEntryType {
    ApiContract,
    TaskClaim,
    BugReport,
    Decision,
    Handoff,
}

impl BlackboardEntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            BlackboardEntryType::ApiContract => "API_CONTRACT",
            BlackboardEntryType::TaskClaim => "TASK_CLAIM",
            BlackboardEntryType::BugReport => "BUG_REPORT",
            BlackboardEntryType::Decision => "DECISION",
            BlackboardEntryType::Handoff => "HANDOFF",
        }
    }
}

impl fmt::Display for BlackboardEntryType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for BlackboardEntryType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "API_CONTRACT" => Ok(BlackboardEntryType::ApiContract),
            "TASK_CLAIM" => Ok(BlackboardEntryType::TaskClaim),
            "BUG_REPORT" => Ok(BlackboardEntryType::BugReport),
            "DECISION" => Ok(BlackboardEntryType::Decision),
            "HANDOFF" => Ok(BlackboardEntryType::Handoff),
            other => Err(format!("Unknown blackboard entry type: {other}")),
        }
    }
}

/// An entry published to the shared blackboard
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlackboardEntry {
    pub id: i64,
    pub workspace_id: String,
    pub author_agent_id: String,
    pub entry_type: BlackboardEntryType,
    pub title: String,
    pub content_markdown: String,
    pub target_agent_id: Option<String>,
    pub is_resolved: bool,
    pub created_at: String,
}

/// Advisory file lock held by an agent
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileLockInfo {
    pub workspace_id: String,
    pub relative_file_path: String,
    pub locked_by_agent_id: String,
    pub intent: Option<String>,
    pub locked_at: String,
}

/// Time-travel Git Snapshot record
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitSnapshotInfo {
    pub id: String,
    pub agent_id: String,
    pub git_tree_oid: String,
    pub summary: String,
    pub files_changed_count: u32,
    pub created_at: String,
}

/// Workspace Metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub root_repo_path: String,
    pub obsidian_vault_path: Option<String>,
    pub created_at: String,
}

/// Active Agent Instance info
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentInstanceInfo {
    pub id: String,
    pub workspace_id: String,
    pub cli_type: String,
    pub pty_pid: Option<u32>,
    pub worktree_path: Option<String>,
    pub git_branch: Option<String>,
    pub status: AgentStatus,
    pub estimated_tokens: u64,
    pub created_at: String,
}
