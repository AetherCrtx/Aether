use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tracing::info;

pub const DEFAULT_AGENTS_TOML: &str = include_str!("../../../config/default_agents.toml");
pub const DEFAULT_THEME_TOML: &str = include_str!("../../../config/default_theme.toml");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
    #[serde(default = "default_auto_worktree")]
    pub auto_worktree: bool,
    #[serde(default = "default_mcp_path")]
    pub mcp_binary_path: String,
    #[serde(default = "default_sandbox")]
    pub default_sandbox: String,
}

fn default_auto_worktree() -> bool {
    true
}
fn default_mcp_path() -> String {
    "/usr/local/bin/aether-mcp".to_string()
}
fn default_sandbox() -> String {
    "workspace-only".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProfileConfig {
    pub display_name: String,
    pub binary: String,
    pub color: String,
    #[serde(default)]
    pub supports_mcp: bool,
    pub mcp_injection_strategy: Option<String>,
    #[serde(default)]
    pub mcp_args: Vec<String>,
    #[serde(default)]
    pub headless_args: Vec<String>,
    #[serde(default)]
    pub args: Vec<String>,
    pub context_injection_strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsConfig {
    #[serde(default = "default_global")]
    pub global: GlobalConfig,
    #[serde(default)]
    pub agents: HashMap<String, AgentProfileConfig>,
}

fn default_global() -> GlobalConfig {
    GlobalConfig {
        auto_worktree: true,
        mcp_binary_path: default_mcp_path(),
        default_sandbox: default_sandbox(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    pub name: String,
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub selection_background: String,
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontConfig {
    pub family: String,
    pub size: f32,
    pub line_height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeybindingsConfig {
    #[serde(default)]
    pub split_vertical: String,
    #[serde(default)]
    pub split_horizontal: String,
    #[serde(default)]
    pub close_pane: String,
    #[serde(default)]
    pub orchestrator_bar: String,
    #[serde(default)]
    pub diff_gatekeeper: String,
    #[serde(default)]
    pub time_travel: String,
    #[serde(default)]
    pub obsidian_sidebar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub theme: ThemeColors,
    pub font: FontConfig,
    pub keybindings: KeybindingsConfig,
}

/// Resolves standard `~/.config/aether/` configuration directory
pub fn resolve_config_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("AETHER_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
    if let Some(proj_dirs) = ProjectDirs::from("com", "aether", "aether") {
        proj_dirs.config_dir().to_path_buf()
    } else {
        PathBuf::from(".config/aether")
    }
}

/// Ensures `~/.config/aether/` exists and seeds default `agents.toml` and `theme.toml`
pub fn ensure_default_configs() -> Result<PathBuf> {
    let config_dir = resolve_config_dir();
    fs::create_dir_all(&config_dir)
        .with_context(|| format!("Failed to create config dir at {}", config_dir.display()))?;

    let agents_path = config_dir.join("agents.toml");
    if !agents_path.exists() {
        fs::write(&agents_path, DEFAULT_AGENTS_TOML).with_context(|| {
            format!("Failed to write default agents.toml to {}", agents_path.display())
        })?;
        info!("Seeded default agents config at: {}", agents_path.display());
    }

    let theme_path = config_dir.join("theme.toml");
    if !theme_path.exists() {
        fs::write(&theme_path, DEFAULT_THEME_TOML).with_context(|| {
            format!("Failed to write default theme.toml to {}", theme_path.display())
        })?;
        info!("Seeded default theme config at: {}", theme_path.display());
    }

    Ok(config_dir)
}

/// Loads and parses `agents.toml`
pub fn load_agents_config() -> Result<AgentsConfig> {
    let config_dir = ensure_default_configs()?;
    let path = config_dir.join("agents.toml");
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read agents config from {}", path.display()))?;
    let config: AgentsConfig = toml::from_str(&content)
        .with_context(|| format!("Failed to parse TOML from {}", path.display()))?;
    Ok(config)
}

/// Loads and parses `theme.toml`
pub fn load_theme_config() -> Result<ThemeConfig> {
    let config_dir = ensure_default_configs()?;
    let path = config_dir.join("theme.toml");
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read theme config from {}", path.display()))?;
    let config: ThemeConfig = toml::from_str(&content)
        .with_context(|| format!("Failed to parse TOML from {}", path.display()))?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_default_agents() {
        let parsed: AgentsConfig = toml::from_str(DEFAULT_AGENTS_TOML).expect("Valid agents TOML");
        assert!(parsed.agents.contains_key("claude-code"));
        assert!(parsed.agents.contains_key("opencode"));
        assert!(parsed.agents.contains_key("codex"));
        assert!(parsed.agents.contains_key("antigravity"));
        assert!(parsed.agents.contains_key("hermes"));
        assert!(parsed.agents.contains_key("shell"));
    }

    #[test]
    fn test_parse_default_theme() {
        let parsed: ThemeConfig = toml::from_str(DEFAULT_THEME_TOML).expect("Valid theme TOML");
        assert_eq!(parsed.theme.name, "Tokyo Night Dark");
        assert_eq!(parsed.keybindings.orchestrator_bar, "Ctrl+Space");
        assert_eq!(parsed.keybindings.diff_gatekeeper, "Alt+M");
        assert_eq!(parsed.keybindings.obsidian_sidebar, "Ctrl+B");
    }
}
