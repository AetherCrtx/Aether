use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedTool {
    pub id: String,
    pub name: String,
    pub binary: String,
    pub path: String,
    pub category: String, // "agent" | "shell"
    pub color: String,
    pub description: String,
    pub is_system_default: bool,
}

/// Check if a given file path exists and is executable
pub fn is_executable<P: AsRef<Path>>(path: P) -> bool {
    let p = path.as_ref();
    if let Ok(metadata) = std::fs::metadata(p) {
        if metadata.is_file() {
            let mode = metadata.permissions().mode();
            return mode & 0o111 != 0;
        }
    }
    false
}

/// Look up a binary name in standard PATH and common user tool directories
pub fn find_in_path(binary: &str) -> Option<PathBuf> {
    if binary.contains('/') {
        let p = PathBuf::from(binary);
        if is_executable(&p) {
            return Some(p);
        }
        return None;
    }

    let mut search_dirs = Vec::new();

    // 1. Check directories from $PATH
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in path_var.split(':') {
            if !dir.is_empty() {
                search_dirs.push(PathBuf::from(dir));
            }
        }
    }

    // 2. Extra common user directories for developer CLI tools on Linux
    if let Ok(home) = std::env::var("HOME") {
        let home_p = PathBuf::from(home);
        search_dirs.push(home_p.join(".local/bin"));
        search_dirs.push(home_p.join(".cargo/bin"));
        search_dirs.push(home_p.join(".opencode/bin"));
        search_dirs.push(home_p.join(".gemini/antigravity-cli/bin"));
        search_dirs.push(home_p.join(".npm-global/bin"));
    }
    search_dirs.push(PathBuf::from("/usr/local/bin"));
    search_dirs.push(PathBuf::from("/usr/bin"));
    search_dirs.push(PathBuf::from("/bin"));

    for dir in search_dirs {
        let candidate = dir.join(binary);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }

    None
}

struct AgentDef {
    id: &'static str,
    name: &'static str,
    binaries: &'static [&'static str],
    color: &'static str,
    description: &'static str,
}

const KNOWN_AGENTS: &[AgentDef] = &[
    AgentDef {
        id: "opencode",
        name: "OpenCode",
        binaries: &["opencode"],
        color: "#3B82F6",
        description: "Open-source autonomous agentic coding CLI",
    },
    AgentDef {
        id: "claude-code",
        name: "Claude Code",
        binaries: &["claude"],
        color: "#D97757",
        description: "Anthropic Claude Code agentic CLI",
    },
    AgentDef {
        id: "codex",
        name: "OpenAI Codex",
        binaries: &["codex"],
        color: "#10B981",
        description: "OpenAI Codex CLI coding assistant",
    },
    AgentDef {
        id: "antigravity",
        name: "Antigravity CLI",
        binaries: &["antigravity", "agy"],
        color: "#A855F7",
        description: "Google DeepMind Advanced Agentic Coding CLI",
    },
    AgentDef {
        id: "hermes",
        name: "Hermes Agent",
        binaries: &["hermes"],
        color: "#EC4899",
        description: "Hermes autonomous coding orchestrator",
    },
    AgentDef {
        id: "aider",
        name: "Aider AI",
        binaries: &["aider"],
        color: "#F59E0B",
        description: "AI pair programming in your terminal",
    },
    AgentDef {
        id: "goose",
        name: "Goose CLI",
        binaries: &["goose"],
        color: "#06B6D4",
        description: "Open-source on-machine developer agent",
    },
    AgentDef {
        id: "gemini",
        name: "Gemini CLI",
        binaries: &["gemini"],
        color: "#8B5CF6",
        description: "Google Gemini developer CLI",
    },
    AgentDef {
        id: "cursor",
        name: "Cursor CLI",
        binaries: &["cursor"],
        color: "#6366F1",
        description: "Cursor agent terminal command",
    },
    AgentDef {
        id: "kilo",
        name: "Kilo Agent",
        binaries: &["kilo"],
        color: "#E11D48",
        description: "Kilo autonomous agent CLI",
    },
    AgentDef {
        id: "devin",
        name: "Devin CLI",
        binaries: &["devin"],
        color: "#14B8A6",
        description: "Devin AI coding agent CLI",
    },
];

/// Scan the user's system and return ONLY agentic tools and shells that actually exist
pub fn detect_available_tools() -> Vec<DetectedTool> {
    let mut detected = Vec::new();
    let mut seen_ids = HashSet::new();

    // 1. Detect interactive shells - prioritize user's actual system $SHELL
    let sys_shell_path = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let sys_shell_stem = Path::new(&sys_shell_path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("bash")
        .to_string();

    let known_shells = [
        ("fish", "Fish", "#FB923C"),
        ("bash", "Bash", "#4ADE80"),
        ("zsh", "Zsh", "#38BDF8"),
        ("sh", "Sh", "#94A3B8"),
    ];

    // First: Register the user's system default shell
    if let Some(path) = find_in_path(&sys_shell_path) {
        let color = match sys_shell_stem.as_str() {
            "fish" => "#FB923C",
            "zsh" => "#38BDF8",
            "bash" => "#4ADE80",
            _ => "#818CF8",
        };
        let label = match sys_shell_stem.as_str() {
            "fish" => "Fish Shell (System Default)",
            "bash" => "Bash (System Default)",
            "zsh" => "Zsh (System Default)",
            other => other,
        };

        detected.push(DetectedTool {
            id: sys_shell_stem.clone(),
            name: label.to_string(),
            binary: sys_shell_path.clone(),
            path: path.to_string_lossy().to_string(),
            category: "shell".to_string(),
            color: color.to_string(),
            description: format!("System default login shell at {}", path.display()),
            is_system_default: true,
        });
        seen_ids.insert(sys_shell_stem.clone());
    }

    // Second: Register any other shells installed on the system without duplicating default
    for (id, label, color) in known_shells {
        if !seen_ids.contains(id) {
            if let Some(path) = find_in_path(id) {
                detected.push(DetectedTool {
                    id: id.to_string(),
                    name: label.to_string(),
                    binary: id.to_string(),
                    path: path.to_string_lossy().to_string(),
                    category: "shell".to_string(),
                    color: color.to_string(),
                    description: format!("Interactive shell at {}", path.display()),
                    is_system_default: false,
                });
                seen_ids.insert(id.to_string());
            }
        }
    }

    // 2. Detect installed AI Agentic Coding Tools
    for agent in KNOWN_AGENTS {
        for &bin_candidate in agent.binaries {
            if let Some(path) = find_in_path(bin_candidate) {
                if !seen_ids.contains(agent.id) {
                    detected.push(DetectedTool {
                        id: agent.id.to_string(),
                        name: agent.name.to_string(),
                        binary: bin_candidate.to_string(),
                        path: path.to_string_lossy().to_string(),
                        category: "agent".to_string(),
                        color: agent.color.to_string(),
                        description: format!("{} (installed at {})", agent.description, path.display()),
                        is_system_default: false,
                    });
                    seen_ids.insert(agent.id.to_string());
                }
                break;
            }
        }
    }

    detected
}

/// Validate if an arbitrary command or binary is available on the machine
pub fn validate_custom_tool(binary: &str, category_opt: Option<&str>) -> Result<DetectedTool, String> {
    let trimmed = binary.trim();
    if trimmed.is_empty() {
        return Err("Binary name cannot be empty".to_string());
    }

    if let Some(path) = find_in_path(trimmed) {
        let file_stem = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(trimmed);
        let category = category_opt.unwrap_or("agent").to_string();

        Ok(DetectedTool {
            id: file_stem.to_lowercase(),
            name: file_stem.to_string(),
            binary: trimmed.to_string(),
            path: path.to_string_lossy().to_string(),
            category,
            color: "#38BDF8".to_string(),
            description: format!("Custom tool located at {}", path.display()),
            is_system_default: false,
        })
    } else {
        Err(format!("Binary '{}' not found in PATH or executable directories", trimmed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_available_tools_finds_shells() {
        let tools = detect_available_tools();
        assert!(!tools.is_empty(), "Should detect at least default shell or /bin/sh");
        let has_shell = tools.iter().any(|t| t.category == "shell");
        assert!(has_shell, "At least one shell should be detected");
        let has_default = tools.iter().any(|t| t.category == "shell" && t.is_system_default);
        assert!(has_default, "Should detect and mark system default shell");
    }

    #[test]
    fn test_validate_custom_tool_known_and_unknown() {
        // bash or sh should always exist on Linux
        let res = validate_custom_tool("sh", Some("shell"));
        assert!(res.is_ok(), "sh should be found in system path");

        let bad = validate_custom_tool("nonexistent_binary_xyz_12345", None);
        assert!(bad.is_err(), "nonexistent binary should return Err");
    }
}
