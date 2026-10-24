use super::client::{AiPilotClient, ChatMessage, FunctionDefinition, ToolDefinition};
use super::provider::load_provider_config;
use crate::pty_manager::PtyManager;
use crate::DaemonContext;
use aether_protocol::ipc::IpcEvent;
use regex::Regex;
use serde_json::json;
use std::sync::OnceLock;
use std::time::Duration;
use tracing::{debug, info, warn};

static ANSI_REGEX: OnceLock<Regex> = OnceLock::new();

/// Returns a pre-compiled regex for stripping all ANSI CSI, OSC, and control escape sequences
pub fn get_ansi_regex() -> &'static Regex {
    ANSI_REGEX.get_or_init(|| {
        Regex::new(r"(?x)
            \x1b\[[0-9;?]*[ -/]*[@-~]              # CSI escape sequences
            |\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)     # OSC operating system commands
            |\x1b[()][A-Z0-9]                      # 2-char charset escape sequences
            |\x1b[P_^\\][^\x1b]*\x1b\\             # DCS, APC, PM sequences
            |\x1b[=>NFHMEDcmnol]                   # Single-char escape sequences
        ").expect("Failed to compile ANSI stripping regex")
    })
}

/// Strips ANSI escape sequences and normalizes carriage return line endings
pub fn strip_ansi_escapes(raw: &str) -> String {
    let re = get_ansi_regex();
    let stripped = re.replace_all(raw, "");

    // Normalize carriage returns: replace \r\n with \n, then handle residual \r
    let mut normalized = String::with_capacity(stripped.len());
    for line in stripped.split("\r\n") {
        if let Some(last_seg) = line.split('\r').last() {
            normalized.push_str(last_seg);
        } else {
            normalized.push_str(line);
        }
        normalized.push('\n');
    }

    // Trim single trailing newline added by loop
    if normalized.ends_with('\n') {
        normalized.pop();
    }

    normalized
}

/// Reads the clean plain-text screen content of the terminal pane
pub async fn inspect_pane_screen(pty_manager: &PtyManager, pane_id: &str) -> Result<String, String> {
    let (bytes, _) = pty_manager
        .get_scrollback(pane_id)
        .await
        .map_err(|e| format!("Failed to read scrollback for pane {pane_id}: {e}"))?;

    let text_lossy = String::from_utf8_lossy(&bytes);
    let cleaned = strip_ansi_escapes(&text_lossy);

    // Keep the last 120 lines to provide sufficient context while preserving LLM token budget
    let lines: Vec<&str> = cleaned.lines().collect();
    let max_lines = 120;
    let window = if lines.len() > max_lines {
        &lines[lines.len() - max_lines..]
    } else {
        &lines[..]
    };

    let result = window.join("\n");
    if result.trim().is_empty() {
        Ok("<terminal screen is empty>".to_string())
    } else {
        Ok(result)
    }
}

/// Types input text into the target pane followed by a delayed Carriage Return (\r)
pub async fn type_into_pane(pty_manager: &PtyManager, pane_id: &str, text: &str) -> Result<(), String> {
    // If text already has trailing newline or carriage return, sanitize it
    let clean_text = text.trim_end_matches(&['\r', '\n'][..]);

    // Send literal characters
    if !clean_text.is_empty() {
        pty_manager
            .write_input(pane_id, clean_text.as_bytes())
            .await
            .map_err(|e| format!("Failed to type into pane {pane_id}: {e}"))?;
    }

    // Brief delay to allow TUI frameworks (e.g. Inquirer, Ink, Bubbles) to register character buffers
    tokio::time::sleep(Duration::from_millis(60)).await;

    // Send carriage return to submit
    pty_manager
        .write_input(pane_id, b"\r")
        .await
        .map_err(|e| format!("Failed to send submit keystroke to pane {pane_id}: {e}"))?;

    Ok(())
}

/// Sends specific control keystroke signals to the target pane
pub async fn send_keystroke(pty_manager: &PtyManager, pane_id: &str, key: &str) -> Result<(), String> {
    let normalized = key.trim().to_lowercase();
    let bytes: &[u8] = match normalized.as_str() {
        "enter" | "return" => b"\r",
        "escape" | "esc" => b"\x1b",
        "ctrl+c" | "ctrl-c" | "sigint" => b"\x03",
        "ctrl+d" | "ctrl-d" | "eof" => b"\x04",
        "ctrl+z" => b"\x1a",
        "tab" => b"\t",
        "backspace" => b"\x7f",
        "up" => b"\x1b[A",
        "down" => b"\x1b[B",
        "right" => b"\x1b[C",
        "left" => b"\x1b[D",
        "y" => b"y\r",
        "n" => b"n\r",
        "yes" => b"yes\r",
        "no" => b"no\r",
        other => {
            if other.len() == 1 {
                other.as_bytes()
            } else {
                return Err(format!("Unknown key name: '{other}'"));
            }
        }
    };

    pty_manager
        .write_input(pane_id, bytes)
        .await
        .map_err(|e| format!("Failed to send keystroke to pane {pane_id}: {e}"))?;

    Ok(())
}

/// Polls pane output until activity stops or an idle prompt returns
pub async fn watch_pane_until_idle(
    pty_manager: &PtyManager,
    pane_id: &str,
    timeout_secs: u64,
) -> Result<String, String> {
    let effective_timeout = timeout_secs.clamp(1, 60);
    let start = std::time::Instant::now();
    let timeout_duration = Duration::from_secs(effective_timeout);

    let mut last_offset: u64 = 0;
    let mut stable_ticks = 0;

    // Initial brief delay for process to begin outputting
    tokio::time::sleep(Duration::from_millis(300)).await;

    while start.elapsed() < timeout_duration {
        match pty_manager.get_scrollback(pane_id).await {
            Ok((bytes, offset)) => {
                if offset == last_offset {
                    stable_ticks += 1;
                    // If output has stabilized for 3 checks (approx 1.2s of inactivity)
                    if stable_ticks >= 3 {
                        let text = String::from_utf8_lossy(&bytes);
                        let clean = strip_ansi_escapes(&text);
                        let last_lines: Vec<&str> = clean.lines().rev().take(15).collect();
                        let preview: Vec<&str> = last_lines.into_iter().rev().collect();
                        return Ok(format!("Pane is idle. Recent screen output:\n{}", preview.join("\n")));
                    }
                } else {
                    last_offset = offset;
                    stable_ticks = 0;
                }
            }
            Err(e) => return Err(format!("Error watching pane {pane_id}: {e}")),
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }

    // Reached timeout
    let (bytes, _) = pty_manager
        .get_scrollback(pane_id)
        .await
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    let clean = strip_ansi_escapes(&text);
    let last_lines: Vec<&str> = clean.lines().rev().take(15).collect();
    let preview: Vec<&str> = last_lines.into_iter().rev().collect();
    Ok(format!(
        "Observation period timed out after {effective_timeout}s. Current output:\n{}",
        preview.join("\n")
    ))
}

/// Returns the tool definitions exposed to the AI Pilot LLM
pub fn get_ai_pilot_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            r#type: "function".to_string(),
            function: FunctionDefinition {
                name: "inspect_pane_screen".to_string(),
                description: "Read the clean plain text terminal screen of the target pane.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "pane_id": {
                            "type": "string",
                            "description": "The pane ID to inspect"
                        }
                    },
                    "required": ["pane_id"]
                }),
            },
        },
        ToolDefinition {
            r#type: "function".to_string(),
            function: FunctionDefinition {
                name: "type_into_pane".to_string(),
                description: "Type input text into the target pane and submit with Enter.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "pane_id": {
                            "type": "string",
                            "description": "The pane ID"
                        },
                        "text": {
                            "type": "string",
                            "description": "The command or prompt text to type"
                        }
                    },
                    "required": ["pane_id", "text"]
                }),
            },
        },
        ToolDefinition {
            r#type: "function".to_string(),
            function: FunctionDefinition {
                name: "send_keystroke".to_string(),
                description: "Send a control keystroke ('enter', 'escape', 'ctrl+c', 'y', 'n', 'tab', 'up', 'down').".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "pane_id": {
                            "type": "string",
                            "description": "The pane ID"
                        },
                        "key": {
                            "type": "string",
                            "description": "Key identifier: 'enter', 'escape', 'ctrl+c', 'y', 'n'"
                        }
                    },
                    "required": ["pane_id", "key"]
                }),
            },
        },
        ToolDefinition {
            r#type: "function".to_string(),
            function: FunctionDefinition {
                name: "watch_pane_until_idle".to_string(),
                description: "Poll the target pane output until command or agent execution completes.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "pane_id": {
                            "type": "string",
                            "description": "The pane ID"
                        },
                        "timeout_secs": {
                            "type": "integer",
                            "description": "Max seconds to watch (default 15)"
                        }
                    },
                    "required": ["pane_id"]
                }),
            },
        },
    ]
}

/// Executes the autonomous AI Pilot supervisor cycle for a user instruction
pub async fn run_ai_pilot_cycle(
    ctx: &DaemonContext,
    pane_id: &str,
    instruction: &str,
) -> Result<String, String> {
    let config = load_provider_config().map_err(|e| e.to_string())?;
    let provider = config.default_provider.clone();
    let settings = config.providers.get(&provider).ok_or_else(|| {
        format!("Provider configuration for '{provider}' not found.")
    })?;

    if provider != "ollama" && settings.api_key.trim().is_empty() {
        return Err(format!(
            "No API key configured for provider '{provider}'. Please configure your API Key in Provider Settings."
        ));
    }

    info!(
        "Starting AI Pilot cycle for pane '{}' with provider '{}' (model: '{}')",
        pane_id, provider, settings.model
    );

    let client = AiPilotClient::new();
    let tools = get_ai_pilot_tools();

    let _ = ctx.event_tx.send(IpcEvent::AiPilotEvent {
        pane_id: pane_id.to_string(),
        step: "AI Pilot cycle started".to_string(),
        details: Some(format!("Provider: {provider}, Model: {}", settings.model)),
    });

    let system_prompt = "\
You are the Aether Native AI Pilot, an autonomous terminal supervisor inside AetherTerminal.
Your job is to pilot, monitor, and guide interactive CLI coding agents (Claude Code, Gemini CLI, OpenCode, shells) or standard shell tasks.
You have access to tools:
- inspect_pane_screen: Read the current screen to see agent output, error messages, or questions.
- type_into_pane: Send text commands or prompt responses followed by Enter.
- send_keystroke: Send control keys ('enter', 'escape', 'ctrl+c', 'y', 'n').
- watch_pane_until_idle: Wait for execution to finish.

Workflow:
1. First inspect the screen if you need to determine what is currently running or displayed.
2. Formulate the appropriate input or command and send it.
3. Watch until idle to verify results.
4. When finished, provide a concise summary of what was accomplished.";

    let mut messages = vec![
        ChatMessage::system(system_prompt),
        ChatMessage::user(format!(
            "Instruction for terminal pane '{pane_id}':\n{instruction}"
        )),
    ];

    let max_turns = 10;
    for turn in 1..=max_turns {
        debug!("AI Pilot turn {}/{}", turn, max_turns);

        let _ = ctx.event_tx.send(IpcEvent::AiPilotEvent {
            pane_id: pane_id.to_string(),
            step: format!("Reasoning (Turn {turn}/{max_turns})"),
            details: None,
        });

        let response = match client
            .chat_completion(&provider, settings, &messages, &tools)
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let err_msg = format!("AI Pilot API call failed: {e}");
                warn!("{}", err_msg);
                let _ = ctx.event_tx.send(IpcEvent::AiPilotEvent {
                    pane_id: pane_id.to_string(),
                    step: "Error".to_string(),
                    details: Some(err_msg.clone()),
                });
                return Err(err_msg);
            }
        };

        if response.tool_calls.is_empty() {
            // Finished with a direct response
            let final_text = response
                .content
                .unwrap_or_else(|| "Pilot completed instruction.".to_string());

            let _ = ctx.event_tx.send(IpcEvent::AiPilotEvent {
                pane_id: pane_id.to_string(),
                step: "Completed".to_string(),
                details: Some(final_text.clone()),
            });

            return Ok(final_text);
        }

        // Add assistant message with tool calls
        messages.push(ChatMessage::assistant(
            response.content.clone(),
            Some(response.tool_calls.clone()),
        ));

        // Execute each tool call
        for tool_call in &response.tool_calls {
            let fn_name = tool_call.function.name.as_str();
            let args_json: serde_json::Value =
                serde_json::from_str(&tool_call.function.arguments).unwrap_or_else(|_| json!({}));

            let _ = ctx.event_tx.send(IpcEvent::AiPilotEvent {
                pane_id: pane_id.to_string(),
                step: format!("Tool: {fn_name}"),
                details: Some(tool_call.function.arguments.clone()),
            });

            let tool_result = match fn_name {
                "inspect_pane_screen" => {
                    let target_pane = args_json
                        .get("pane_id")
                        .and_then(|p| p.as_str())
                        .unwrap_or(pane_id);
                    inspect_pane_screen(&ctx.pty_manager, target_pane).await
                }
                "type_into_pane" => {
                    let target_pane = args_json
                        .get("pane_id")
                        .and_then(|p| p.as_str())
                        .unwrap_or(pane_id);
                    let text = args_json
                        .get("text")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");
                    type_into_pane(&ctx.pty_manager, target_pane, text)
                        .await
                        .map(|_| format!("Typed text into pane {target_pane} and pressed Enter"))
                }
                "send_keystroke" => {
                    let target_pane = args_json
                        .get("pane_id")
                        .and_then(|p| p.as_str())
                        .unwrap_or(pane_id);
                    let key = args_json
                        .get("key")
                        .and_then(|k| k.as_str())
                        .unwrap_or("enter");
                    send_keystroke(&ctx.pty_manager, target_pane, key)
                        .await
                        .map(|_| format!("Sent keystroke '{key}' to pane {target_pane}"))
                }
                "watch_pane_until_idle" => {
                    let target_pane = args_json
                        .get("pane_id")
                        .and_then(|p| p.as_str())
                        .unwrap_or(pane_id);
                    let timeout = args_json
                        .get("timeout_secs")
                        .and_then(|t| t.as_u64())
                        .unwrap_or(15);
                    watch_pane_until_idle(&ctx.pty_manager, target_pane, timeout).await
                }
                other => Err(format!("Unknown tool function: {other}")),
            };

            let result_str = match tool_result {
                Ok(s) => s,
                Err(e) => format!("Error executing {fn_name}: {e}"),
            };

            messages.push(ChatMessage::tool(&tool_call.id, result_str));
        }
    }

    let summary = format!("AI Pilot reached turn limit ({max_turns}) for instruction.");
    let _ = ctx.event_tx.send(IpcEvent::AiPilotEvent {
        pane_id: pane_id.to_string(),
        step: "Completed".to_string(),
        details: Some(summary.clone()),
    });

    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_escapes_basic_colors() {
        let input = "\x1b[31mRed text\x1b[0m and \x1b[1;32mBold Green\x1b[0m";
        let output = strip_ansi_escapes(input);
        assert_eq!(output, "Red text and Bold Green");
    }

    #[test]
    fn test_strip_ansi_escapes_osc_and_cursor() {
        let input = "\x1b]0;Terminal Title\x07\x1b[2K\x1b[1;1HWelcome to Aether";
        let output = strip_ansi_escapes(input);
        assert_eq!(output, "Welcome to Aether");
    }

    #[test]
    fn test_strip_ansi_escapes_carriage_return_overwriting() {
        let input = "Progress: 10%\rProgress: 50%\rProgress: 100%\nDone";
        let output = strip_ansi_escapes(input);
        assert_eq!(output, "Progress: 100%\nDone");
    }

    #[test]
    fn test_ai_pilot_tools_schema() {
        let tools = get_ai_pilot_tools();
        assert_eq!(tools.len(), 4);
        let names: Vec<_> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(names.contains(&"inspect_pane_screen"));
        assert!(names.contains(&"type_into_pane"));
        assert!(names.contains(&"send_keystroke"));
        assert!(names.contains(&"watch_pane_until_idle"));
    }
}
